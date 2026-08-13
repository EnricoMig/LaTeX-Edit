import { baseName, ensureTexExtension, parentPath } from "./workspace-fs.js";

const DND_MIME = "application/x-latexedit-path";

function iconFor(type, kind) {
    if (type === "dir") {
        return "▸";
    }
    if (kind === "pdf") {
        return "P";
    }
    if (kind === "bib") {
        return "B";
    }
    if (kind === "sty") {
        return "S";
    }
    return "T";
}

function hasDnDPayload(dataTransfer) {
    if (!dataTransfer?.types) {
        return false;
    }
    return Array.from(dataTransfer.types).includes(DND_MIME);
}

export function createExplorer({
    rootEl,
    treeEl,
    titleEl,
    fs,
    onOpenFile,
    onTreeChanged,
    onInsertImport,
    onRequestConfirm,
    onRequireFolder,
}) {
    let contextPath = null;
    let renamingPath = null;
    let renameInFlight = false;
    let moveInFlight = false;
    let dragSourcePath = null;
    let mainPosition = localStorage.getItem("latexedit.mainSort") === "below" ? "below" : "above";

    const btnMainAbove = rootEl.querySelector("#btn-main-sort-above");
    const btnMainBelow = rootEl.querySelector("#btn-main-sort-below");

    function syncMainSortButtons() {
        btnMainAbove?.setAttribute("aria-pressed", String(mainPosition === "above"));
        btnMainBelow?.setAttribute("aria-pressed", String(mainPosition === "below"));
    }

    function setMainPosition(position) {
        mainPosition = position === "below" ? "below" : "above";
        localStorage.setItem("latexedit.mainSort", mainPosition);
        syncMainSortButtons();
        render();
    }

    const contextMenu = document.createElement("div");
    contextMenu.className = "context-menu";
    contextMenu.hidden = true;
    contextMenu.setAttribute("role", "menu");
    document.body.appendChild(contextMenu);

    function hideContextMenu() {
        contextMenu.hidden = true;
        contextPath = null;
    }

    function isContextMenuOpen() {
        return !contextMenu.hidden;
    }

    function showContextMenu(x, y, path, type, kind) {
        contextPath = path;
        const items = [];

        if (type === "file") {
            items.push({ label: "Abrir", action: "open" });
            items.push({ label: "Renomear", action: "rename" });
            if (kind !== "pdf") {
                items.push({ label: "Inserir \\input{}", action: "input" });
                items.push({ label: "Inserir \\include{}", action: "include" });
            }
            items.push({ label: "Excluir", action: "delete", danger: true });
        } else {
            items.push(
                { label: "Nova pasta", action: "new-folder" },
                { label: "Novo arquivo .tex", action: "new-file" },
                { label: "Renomear", action: "rename" },
                { label: "Excluir", action: "delete", danger: true }
            );
        }

        contextMenu.innerHTML = items
            .map(
                (item) =>
                    `<button type="button" class="context-item${item.danger ? " is-danger" : ""}" data-action="${item.action}">${item.label}</button>`
            )
            .join("");

        contextMenu.hidden = false;
        const rect = contextMenu.getBoundingClientRect();
        const left = Math.min(x, window.innerWidth - rect.width - 8);
        const top = Math.min(y, window.innerHeight - rect.height - 8);
        contextMenu.style.left = `${Math.max(8, left)}px`;
        contextMenu.style.top = `${Math.max(8, top)}px`;
    }

    function startRename(path) {
        renamingPath = path;
        render();
        const input = treeEl.querySelector(`input[data-rename="${CSS.escape(path)}"]`);
        if (input) {
            input.focus();
            input.select();
        }
    }

    async function commitRename(path, nextName) {
        if (renameInFlight) {
            return;
        }
        const pendingPath = path;
        renamingPath = null;
        const trimmed = nextName.trim();
        if (!trimmed || trimmed === baseName(pendingPath)) {
            render();
            return;
        }
        renameInFlight = true;
        try {
            const renamed = await fs.renamePath(pendingPath, trimmed);
            onTreeChanged?.();
            if (fs.isFile(renamed)) {
                onOpenFile?.(renamed, { force: true });
            } else {
                render();
            }
        } catch (error) {
            window.alert(error.message || "Não foi possível renomear.");
            render();
        } finally {
            renameInFlight = false;
        }
    }

    function clearDropHighlights() {
        treeEl.classList.remove("is-drop-root");
        treeEl.querySelectorAll(".tree-row.is-drop-target").forEach((el) => {
            el.classList.remove("is-drop-target");
        });
    }

    function clearDragState() {
        clearDropHighlights();
        treeEl.classList.remove("is-dnd-active");
        treeEl.querySelectorAll(".tree-row.is-dragging").forEach((el) => {
            el.classList.remove("is-dragging");
        });
        dragSourcePath = null;
    }

    function resolveDropTarget(event) {
        const row = event.target.closest?.(".tree-row");
        if (row?.dataset.type === "dir") {
            return row.dataset.path;
        }
        if (row?.dataset.type === "file") {
            return parentPath(row.dataset.path);
        }
        // Soltar na área vazia da árvore = raiz do projeto
        if (treeEl.contains(event.target)) {
            return "";
        }
        return null;
    }

    function isInvalidDrop(source, destDir) {
        if (!source) {
            return false;
        }
        const dest = destDir ?? "";
        if (source === dest) {
            return true;
        }
        if (fs.isDir(source) && (dest === source || dest.startsWith(`${source}/`))) {
            return true;
        }
        return false;
    }

    async function commitMove(sourcePath, destDir) {
        if (moveInFlight) {
            return;
        }
        const source = sourcePath;
        const targetDir = destDir ?? "";
        if (!source) {
            return;
        }
        if (parentPath(source) === targetDir) {
            return;
        }
        const wasActive =
            fs.getActivePath() === source || fs.getActivePath().startsWith(`${source}/`);
        moveInFlight = true;
        try {
            const moved = await fs.movePath(source, targetDir);
            if (targetDir) {
                fs.setExpanded(targetDir, true);
            }
            onTreeChanged?.();
            if (wasActive) {
                if (fs.isFile(moved)) {
                    onOpenFile?.(moved, { force: true });
                } else {
                    render();
                }
            }
        } catch (error) {
            window.alert(error.message || "Não foi possível mover o item.");
            render();
        } finally {
            moveInFlight = false;
        }
    }

    async function promptNewItem(kind, parent = "") {
        if (!fs.isOpen()) {
            onRequireFolder?.();
            return;
        }
        const label = kind === "dir" ? "Nome da pasta:" : "Nome do arquivo:";
        const suggested = kind === "dir" ? "nova-pasta" : "novo.tex";
        const name = window.prompt(label, suggested);
        if (!name) {
            return;
        }
        try {
            const rawName = kind === "file" ? ensureTexExtension(name) : name.trim();
            const path = parent ? `${parent}/${rawName}` : rawName;
            if (kind === "dir") {
                await fs.createFolder(path);
                fs.setExpanded(parent, true);
            } else {
                const created = await fs.createFile(path, "% Novo arquivo\n");
                fs.setExpanded(parentPath(created), true);
                onTreeChanged?.();
                onOpenFile?.(created);
                return;
            }
            onTreeChanged?.();
            render();
        } catch (error) {
            window.alert(error.message || "Não foi possível criar o item.");
        }
    }

    async function handleContextAction(action) {
        const path = contextPath;
        hideContextMenu();
        if (!path) {
            return;
        }

        if (action === "open" && fs.isFile(path)) {
            onOpenFile?.(path);
            return;
        }
        if (action === "rename") {
            startRename(path);
            return;
        }
        if (action === "input" || action === "include") {
            onInsertImport?.(path, action);
            return;
        }
        if (action === "new-file") {
            await promptNewItem("file", path);
            return;
        }
        if (action === "new-folder") {
            await promptNewItem("dir", path);
            return;
        }
        if (action === "delete") {
            const ok = await onRequestConfirm?.(
                `Excluir "${baseName(path)}"${fs.isDir(path) ? " e todo o conteúdo" : ""} da pasta do projeto?`
            );
            if (!ok) {
                return;
            }
            const wasActive =
                fs.getActivePath() === path || fs.getActivePath().startsWith(`${path}/`);
            try {
                await fs.deletePath(path);
                onTreeChanged?.();
                if (wasActive) {
                    const next = fs.getActivePath();
                    if (next) {
                        onOpenFile?.(next, { force: true });
                    } else {
                        onOpenFile?.("", { force: true });
                    }
                } else {
                    render();
                }
            } catch (error) {
                window.alert(error.message || "Não foi possível excluir.");
            }
        }
    }

    function render() {
        titleEl.textContent = fs.isOpen() ? fs.getName() : "Nenhuma pasta";
        titleEl.title = fs.isOpen() ? `NAS: ${fs.getName()}` : "Abra uma pasta no NAS";

        if (!fs.isOpen()) {
            treeEl.innerHTML = `
                <div class="explorer-empty-state">
                    <p>Abra uma pasta do <strong>NAS</strong> (servidor) para editar os arquivos <code>.tex</code>.</p>
                    <button type="button" class="btn btn-primary" id="explorer-open-folder">Abrir pasta no NAS</button>
                </div>
            `;
            treeEl.querySelector("#explorer-open-folder")?.addEventListener("click", () => {
                onRequireFolder?.();
            });
            return;
        }

        const rows = fs.buildTreeRows({ mainPosition });
        if (rows.length === 0) {
            treeEl.innerHTML = `
                <div class="explorer-empty-state">
                    <p>Pasta vazia. Crie um <code>.tex</code> ou importe arquivos.</p>
                </div>
            `;
            return;
        }

        treeEl.innerHTML = rows
            .map((row) => {
                const active = row.path === fs.getActivePath();
                const expanded = row.type === "dir" && fs.isExpanded(row.path);
                const isRenaming = renamingPath === row.path;
                const chevron =
                    row.type === "dir"
                        ? `<span class="tree-chevron${expanded ? " is-open" : ""}" aria-hidden="true">▸</span>`
                        : `<span class="tree-chevron is-file" aria-hidden="true"></span>`;

                const label = isRenaming
                    ? `<input class="tree-rename" data-rename="${row.path}" value="${baseName(row.path).replaceAll('"', "&quot;")}" />`
                    : `<span class="tree-label">${row.name}</span>`;
                const canDrag = !isRenaming;

                return `
                    <div
                        class="tree-row${active ? " is-active" : ""}${row.type === "dir" ? " is-dir" : " is-file"}${row.kind === "pdf" ? " is-pdf" : ""}${canDrag ? " is-draggable" : ""}"
                        data-path="${row.path}"
                        data-type="${row.type}"
                        data-kind="${row.kind || "tex"}"
                        style="--depth: ${row.depth}"
                        title="${row.path}${canDrag ? " · Arraste para mover" : ""}"
                        ${canDrag ? 'draggable="true"' : ""}
                    >
                        ${chevron}
                        <span class="tree-icon" data-kind="${row.type === "dir" ? "dir" : row.kind || "tex"}" aria-hidden="true">${iconFor(row.type, row.kind)}</span>
                        ${label}
                    </div>
                `;
            })
            .join("");
    }

    treeEl.addEventListener("click", (event) => {
        const row = event.target.closest(".tree-row");
        if (!row || event.target.matches("input")) {
            return;
        }
        const path = row.dataset.path;
        const type = row.dataset.type;
        if (type === "dir") {
            fs.toggleExpanded(path);
            render();
            return;
        }
        onOpenFile?.(path);
    });

    treeEl.addEventListener("dblclick", (event) => {
        const row = event.target.closest(".tree-row");
        if (!row || event.target.matches("input")) {
            return;
        }
        startRename(row.dataset.path);
    });

    treeEl.addEventListener("contextmenu", (event) => {
        const row = event.target.closest(".tree-row");
        if (!row) {
            return;
        }
        event.preventDefault();
        showContextMenu(
            event.clientX,
            event.clientY,
            row.dataset.path,
            row.dataset.type,
            row.dataset.kind
        );
    });

    treeEl.addEventListener("dragstart", (event) => {
        const row = event.target.closest(".tree-row");
        if (!row || renamingPath) {
            event.preventDefault();
            return;
        }
        hideContextMenu();
        dragSourcePath = row.dataset.path;
        event.dataTransfer.setData(DND_MIME, row.dataset.path);
        event.dataTransfer.setData("text/plain", row.dataset.path);
        event.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
        treeEl.classList.add("is-dnd-active");
    });

    treeEl.addEventListener("dragend", () => {
        clearDragState();
    });

    treeEl.addEventListener("dragover", (event) => {
        if (!hasDnDPayload(event.dataTransfer) && !dragSourcePath) {
            return;
        }
        const destDir = resolveDropTarget(event);
        if (destDir === null) {
            return;
        }
        const source = dragSourcePath || "";
        if (isInvalidDrop(source, destDir)) {
            clearDropHighlights();
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        clearDropHighlights();
        const row = event.target.closest(".tree-row");
        if (row?.dataset.type === "dir") {
            row.classList.add("is-drop-target");
        } else {
            treeEl.classList.add("is-drop-root");
        }
    });

    treeEl.addEventListener("dragleave", (event) => {
        if (!treeEl.contains(event.relatedTarget)) {
            clearDropHighlights();
        }
    });

    treeEl.addEventListener("drop", (event) => {
        if (!hasDnDPayload(event.dataTransfer) && !dragSourcePath) {
            return;
        }
        event.preventDefault();
        const source =
            event.dataTransfer.getData(DND_MIME) ||
            event.dataTransfer.getData("text/plain") ||
            dragSourcePath;
        const destDir = resolveDropTarget(event);
        clearDragState();
        if (!source || destDir === null || isInvalidDrop(source, destDir)) {
            return;
        }
        commitMove(source, destDir);
    });

    treeEl.addEventListener("keydown", (event) => {
        if (!event.target.matches("input.tree-rename")) {
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            event.target.dataset.renameCommitted = "1";
            commitRename(event.target.dataset.rename, event.target.value);
        }
        if (event.key === "Escape") {
            event.preventDefault();
            renamingPath = null;
            render();
        }
    });

    treeEl.addEventListener(
        "blur",
        (event) => {
            if (!event.target.matches("input.tree-rename")) {
                return;
            }
            if (event.target.dataset.renameCommitted === "1") {
                return;
            }
            commitRename(event.target.dataset.rename, event.target.value);
        },
        true
    );

    contextMenu.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) {
            return;
        }
        handleContextAction(btn.dataset.action);
    });

    // Clique esquerdo (ou toque) fora fecha o menu imediatamente
    document.addEventListener(
        "pointerdown",
        (event) => {
            if (!isContextMenuOpen()) {
                return;
            }
            if (event.button !== 0) {
                return;
            }
            if (contextMenu.contains(event.target)) {
                return;
            }
            hideContextMenu();
        },
        true
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape" && isContextMenuOpen()) {
                hideContextMenu();
            }
        },
        true
    );

    rootEl.querySelector("#btn-new-file")?.addEventListener("click", () => {
        const active = fs.getActivePath();
        const parent = active && fs.isFile(active) ? parentPath(active) : "";
        promptNewItem("file", parent);
    });

    rootEl.querySelector("#btn-new-folder")?.addEventListener("click", () => {
        const active = fs.getActivePath();
        const parent =
            active && fs.isFile(active) ? parentPath(active) : active && fs.isDir(active) ? active : "";
        promptNewItem("dir", parent);
    });

    btnMainAbove?.addEventListener("click", () => setMainPosition("above"));
    btnMainBelow?.addEventListener("click", () => setMainPosition("below"));
    syncMainSortButtons();

    return {
        render,
        startRename,
        promptNewItem,
        hideContextMenu,
    };
}
