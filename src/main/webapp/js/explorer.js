import { baseName, ensureTexExtension, parentPath } from "./workspace-fs.js";

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

    const contextMenu = document.createElement("div");
    contextMenu.className = "context-menu";
    contextMenu.hidden = true;
    document.body.appendChild(contextMenu);

    function hideContextMenu() {
        contextMenu.hidden = true;
        contextPath = null;
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
        renamingPath = null;
        const trimmed = nextName.trim();
        if (!trimmed || trimmed === baseName(path)) {
            render();
            return;
        }
        try {
            const renamed = await fs.renamePath(path, trimmed);
            onTreeChanged?.();
            if (fs.isFile(renamed)) {
                onOpenFile?.(renamed, { force: true });
            } else {
                render();
            }
        } catch (error) {
            window.alert(error.message || "Não foi possível renomear.");
            render();
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

        const rows = fs.buildTreeRows();
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

                return `
                    <div
                        class="tree-row${active ? " is-active" : ""}${row.type === "dir" ? " is-dir" : " is-file"}${row.kind === "pdf" ? " is-pdf" : ""}"
                        data-path="${row.path}"
                        data-type="${row.type}"
                        data-kind="${row.kind || "tex"}"
                        style="--depth: ${row.depth}"
                        title="${row.path}"
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

    treeEl.addEventListener("keydown", (event) => {
        if (!event.target.matches("input.tree-rename")) {
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
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

    document.addEventListener("click", (event) => {
        if (!contextMenu.hidden && !contextMenu.contains(event.target)) {
            hideContextMenu();
        }
    });

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

    return {
        render,
        startRename,
        promptNewItem,
        hideContextMenu,
    };
}
