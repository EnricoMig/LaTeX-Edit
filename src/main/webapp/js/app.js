import {
    insertAtCursor,
    insertTab,
    updateCursorMeta,
    updateLineNumbers,
} from "./editor.js";
import { createExplorer } from "./explorer.js";
import { applyTheme, getStoredTheme, syncThemeToggle, toggleTheme } from "./theme.js";
import { WorkspaceFs, baseName, ensureTexExtension, parentPath } from "./workspace-fs.js";
import { base64ToUint8Array, checkHealth, compileProject, getApiBase } from "./api.js";

const els = {
    editor: document.getElementById("editor"),
    lineNumbers: document.getElementById("line-numbers"),
    preview: document.getElementById("preview"),
    previewMode: document.getElementById("preview-mode"),
    cursorPos: document.getElementById("cursor-pos"),
    charCount: document.getElementById("char-count"),
    statusSync: document.getElementById("status-sync"),
    docName: document.getElementById("doc-name"),
    autosaveHint: document.getElementById("autosave-hint"),
    workspaceMode: document.getElementById("workspace-mode"),
    splitter: document.getElementById("splitter"),
    splitterSide: document.getElementById("splitter-side"),
    workspace: document.getElementById("workspace"),
    explorer: document.getElementById("explorer"),
    explorerTree: document.getElementById("explorer-tree"),
    projectTitle: document.getElementById("project-title"),
    editorPane: document.querySelector(".pane-editor"),
    logPanel: document.getElementById("log-panel"),
    logBody: document.getElementById("log-body"),
    btnSave: document.getElementById("btn-save"),
    btnOpenFolder: document.getElementById("btn-open-folder"),
    btnExportPdf: document.getElementById("btn-export-pdf"),
    btnToggleExplorer: document.getElementById("btn-toggle-explorer"),
    btnToggleLog: document.getElementById("btn-toggle-log"),
    btnCloseLog: document.getElementById("btn-close-log"),
    btnTheme: document.getElementById("btn-theme"),
    layoutButtons: [...document.querySelectorAll(".layout-btn")],
    inputTex: document.getElementById("input-tex"),
    inputPdf: document.getElementById("input-pdf"),
};

const fs = new WorkspaceFs();
let isDirty = false;
let suppressNameBlur = false;
let viewerPdfPath = "";
let explorerOpen = localStorage.getItem("latexedit.explorerOpen") !== "0";
let logOpen = false;
let layoutMode = localStorage.getItem("latexedit.layout") || "split";
if (!["split", "editor", "pdf"].includes(layoutMode)) {
    layoutMode = "split";
}

const AUTO_COMPILE_MS = 2200;
let autoCompileTimer = null;
let compileInFlight = false;
let compileQueued = false;

function setStatus(state, label) {
    els.statusSync.dataset.state = state;
    els.statusSync.textContent = label;
}

function markDirty(dirty) {
    isDirty = dirty;
    setStatus(dirty ? "dirty" : "idle", dirty ? "Não salvo" : "Pronto");
}

function refreshEditorChrome() {
    updateLineNumbers(els.editor, els.lineNumbers);
    updateCursorMeta(els.editor, els.cursorPos, els.charCount);
}

function syncDocNameInput(path) {
    els.docName.value = path ? baseName(path) : "";
    els.docName.title = path || "Sem arquivo";
    els.docName.disabled = !path || !fs.isOpen();
}

function updateWorkspaceModeLabel() {
    els.workspaceMode.textContent = fs.isOpen()
        ? `Pasta: ${fs.getName()}`
        : "Nenhuma pasta aberta";
}

function setEditorEnabled(enabled) {
    els.editor.readOnly = !enabled;
    els.editorPane?.classList.toggle("is-disabled", !enabled);
}

function applyExplorerVisibility() {
    els.workspace.classList.toggle("is-explorer-collapsed", !explorerOpen);
    els.btnToggleExplorer.setAttribute("aria-pressed", String(explorerOpen));
    els.btnToggleExplorer.classList.toggle("is-active", explorerOpen);
    els.btnToggleExplorer.title = explorerOpen ? "Fechar arquivos" : "Abrir arquivos";
    localStorage.setItem("latexedit.explorerOpen", explorerOpen ? "1" : "0");
}

function applyLayoutMode() {
    els.workspace.classList.remove("layout-split", "layout-editor", "layout-pdf");
    els.workspace.classList.add(`layout-${layoutMode}`);
    els.layoutButtons.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.layout === layoutMode);
    });
    localStorage.setItem("latexedit.layout", layoutMode);
}

function setLogOpen(open, { focus = false } = {}) {
    logOpen = open;
    els.logPanel.hidden = !open;
    els.btnToggleLog.setAttribute("aria-pressed", String(open));
    els.btnToggleLog.classList.toggle("is-active", open);
    if (open && focus) {
        els.logPanel.scrollIntoView({ block: "nearest" });
    }
}

function setCompileLog(text) {
    els.logBody.textContent = text || "";
}

function showViewerMessage(title, bodyHtml) {
    viewerPdfPath = "";
    els.previewMode.textContent = "Aguardando PDF";
    els.preview.classList.remove("is-pdf");
    els.preview.innerHTML = `
        <div class="welcome-panel">
            <h2>${title}</h2>
            ${bodyHtml}
        </div>
    `;
}

function showWelcomeViewer() {
    showViewerMessage(
        "Abra a pasta do projeto",
        `
          <p>Use a <strong>Navegação</strong> à esquerda para abrir a pasta raiz, editar o script e gerar o PDF final.</p>
          <button type="button" class="btn btn-primary" id="welcome-open-folder">Abrir pasta</button>
        `
    );
    els.preview.querySelector("#welcome-open-folder")?.addEventListener("click", () => {
        openProjectFolder();
    });
    setEditorEnabled(false);
    els.editor.value = "% Abra uma pasta na navegação para começar.\n";
    refreshEditorChrome();
}

async function renderPdfViewer(path) {
    try {
        // Revoga URL antiga ao reabrir o mesmo path após recompilação
        fs.revokePdfUrl(path);
        const url = await fs.getPdfObjectUrl(path);
        viewerPdfPath = path;
        els.previewMode.textContent = baseName(path);
        els.preview.classList.add("is-pdf");
        els.preview.innerHTML = `
            <div class="pdf-stage">
              <div class="pdf-busy" id="pdf-busy" hidden>Atualizando PDF…</div>
              <iframe class="pdf-frame" title="PDF ${baseName(path)}" src="${url}#toolbar=1&view=FitH"></iframe>
            </div>
        `;
    } catch (error) {
        console.error("Erro ao abrir PDF:", error);
        showViewerMessage("PDF indisponível", `<p>${error.message || "Não foi possível abrir o PDF."}</p>`);
    }
}

function setPdfBusy(busy) {
    const badge = document.getElementById("pdf-busy");
    if (badge) {
        badge.hidden = !busy;
        return;
    }
    if (busy && !els.preview.classList.contains("is-pdf")) {
        els.previewMode.textContent = "Compilando…";
    }
}

function showCompileHint(_texPath) {
    const main = fs.resolveMainDocument(fs.getActivePath());
    const companion = main ? fs.findCompanionPdf(main) : "";
    if (companion) {
        renderPdfViewer(companion);
        return;
    }
    showViewerMessage(
        "PDF final",
        `
          <p>O painel mostra o PDF do documento principal (<code>${escapeHtml(main || "main.tex")}</code>).</p>
          <p>A compilação roda sozinha ~2s após você parar de digitar, ou clique em <strong>Recompile</strong>.</p>
        `
    );
}

function scheduleAutoCompile() {
    if (!fs.isOpen()) {
        return;
    }
    window.clearTimeout(autoCompileTimer);
    autoCompileTimer = window.setTimeout(() => {
        compilePdf({ auto: true });
    }, AUTO_COMPILE_MS);
    setStatus("dirty", "Auto-PDF…");
}

function touchAutosaveHint(message) {
    if (message) {
        els.autosaveHint.textContent = message;
        return;
    }
    const stamp = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    });
    els.autosaveHint.textContent = fs.isOpen() ? `Disco · ${stamp}` : "Sem pasta";
}

function ensureFolderOrWarn() {
    if (fs.isOpen()) {
        return true;
    }
    window.alert("Abra uma pasta raiz na barra de navegação antes de continuar.");
    return false;
}

async function openProjectFolder() {
    if (!fs.supportsNativeFolder()) {
        window.alert(fs.nativeFolderBlockReason());
        return;
    }
    try {
        if (isDirty && !window.confirm("Alterações não salvas serão descartadas. Continuar?")) {
            return;
        }
        await fs.openNativeFolder();
        if (!explorerOpen) {
            explorerOpen = true;
            applyExplorerVisibility();
        }
        updateWorkspaceModeLabel();
        explorer.render();
        const active = fs.getActivePath();
        if (active) {
            await openFile(active, { force: true });
        } else {
            syncDocNameInput("");
            setEditorEnabled(false);
            els.editor.value = "% Pasta vazia — crie um arquivo .tex\n";
            refreshEditorChrome();
            showViewerMessage("Pasta vazia", "<p>Crie um arquivo .tex na navegação.</p>");
            markDirty(false);
        }
        touchAutosaveHint(`Pasta aberta: ${fs.getName()}`);
        setStatus("idle", "Pasta aberta");
        scheduleAutoCompile();
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }
        console.error("Erro ao abrir pasta:", error);
        window.alert(error.message || "Não foi possível abrir a pasta.");
    }
}

async function openFile(path, { force = false } = {}) {
    if (!path) {
        syncDocNameInput("");
        setEditorEnabled(false);
        if (!fs.isOpen()) {
            showWelcomeViewer();
        } else {
            els.editor.value = "";
            refreshEditorChrome();
            showViewerMessage("Sem arquivo", "<p>Selecione um arquivo na navegação.</p>");
        }
        explorer.render();
        return;
    }

    if (!force && path === fs.getActivePath() && !isDirty) {
        explorer.render();
        return;
    }

    if (isDirty && path !== fs.getActivePath()) {
        const keep = window.confirm("Salvar alterações antes de trocar de arquivo?");
        if (keep) {
            await saveDocument({ silent: true });
        } else if (!window.confirm("Descartar alterações não salvas?")) {
            explorer.render();
            return;
        }
    }

    try {
        fs.setActivePath(path);
        syncDocNameInput(path);

        if (fs.isPdf(path)) {
            setEditorEnabled(false);
            els.editor.value = `% Visualizando PDF: ${path}`;
            refreshEditorChrome();
            markDirty(false);
            await renderPdfViewer(path);
        } else if (!fs.isTextFile(path)) {
            setEditorEnabled(false);
            els.editor.value = `% Recurso: ${path}`;
            refreshEditorChrome();
            markDirty(false);
            showViewerMessage("Recurso", `<p>Arquivo binário: <code>${baseName(path)}</code></p>`);
        } else {
            const content = fs.readFile(path);
            setEditorEnabled(true);
            els.editor.value = content;
            refreshEditorChrome();
            markDirty(false);
            showCompileHint(path);
            const main = fs.resolveMainDocument(path);
            if (main && !fs.findCompanionPdf(main)) {
                scheduleAutoCompile();
            }
            els.editor.focus();
        }
        explorer.render();
    } catch (error) {
        console.error("Erro ao abrir arquivo:", error);
        setStatus("error", "Falha ao abrir");
        window.alert(error.message || "Não foi possível abrir o arquivo.");
    }
}

async function saveDocument({ silent = false } = {}) {
    if (!ensureFolderOrWarn()) {
        return;
    }
    const path = fs.getActivePath();
    if (!path) {
        window.alert("Nenhum arquivo ativo para salvar.");
        return;
    }
    if (!fs.isTextFile(path)) {
        window.alert("Este arquivo não é editável como texto.");
        return;
    }

    try {
        fs.writeFile(path, els.editor.value);
        await fs.writeNativeTextFile(path, els.editor.value);
        markDirty(false);
        touchAutosaveHint();
        if (!silent) {
            setStatus("idle", "Salvo no disco");
        }
        explorer.render();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        setStatus("error", "Falha ao salvar");
        window.alert(error.message || "Não foi possível salvar o arquivo na pasta.");
    }
}

function createNewDocument() {
    if (!ensureFolderOrWarn()) {
        return;
    }
    const active = fs.getActivePath();
    const parent = active ? parentPath(active) : "";
    explorer.promptNewItem("file", parent);
}

async function compilePdf({ auto = false } = {}) {
    if (!fs.isOpen()) {
        if (!auto) {
            ensureFolderOrWarn();
        }
        return;
    }

    if (compileInFlight) {
        compileQueued = true;
        return;
    }

    const active = fs.getActivePath();
    const mainPath = fs.resolveMainDocument(active);

    if (!mainPath || !fs.isTextFile(mainPath)) {
        if (!auto) {
            window.alert("Não encontrei um main.tex (ou .tex com \\documentclass) para compilar.");
        }
        return;
    }

    // Salva o arquivo ativo (pode ser um \\input) antes de mandar o projeto
    if (active && fs.isTextFile(active) && isDirty) {
        try {
            fs.writeFile(active, els.editor.value);
            await fs.writeNativeTextFile(active, els.editor.value);
            markDirty(false);
        } catch (error) {
            console.error(error);
            if (!auto) {
                window.alert(error.message || "Falha ao salvar antes de compilar.");
            }
            return;
        }
    }

    compileInFlight = true;
    els.btnExportPdf.disabled = true;
    setStatus("dirty", auto ? "Auto-compilando…" : "Compilando…");
    touchAutosaveHint(`main: ${mainPath}`);
    setPdfBusy(true);
    if (!viewerPdfPath) {
        showViewerMessage("Compilando…", `<p>Documento principal: <code>${escapeHtml(mainPath)}</code></p>`);
    }

    try {
        await checkHealth();
    } catch (error) {
        console.error(error);
        compileInFlight = false;
        els.btnExportPdf.disabled = false;
        setPdfBusy(false);
        setStatus("error", "Sem backend");
        showViewerMessage(
            "Backend indisponível",
            `<p>Não foi possível conectar em <code>${getApiBase()}</code>.</p>
             <p><strong>Use o app em</strong>
             <a href="http://localhost:8081/" target="_blank" rel="noreferrer">http://localhost:8081/</a>
             (a porta 8080/LaTEdit não tem a API de compilação).</p>`
        );
        if (!auto) {
            window.alert(
                `Backend indisponível.\n\nAbra: http://localhost:8081/\n(Evite http://localhost:8080/LaTEdit/)`
            );
        }
        return;
    }

    try {
        const overrides = {};
        if (active && fs.isTextFile(active)) {
            overrides[active] = els.editor.value;
        }
        const payload = await fs.buildCompilePayload(mainPath, overrides);
        const result = await compileProject(payload);

        if (!result.success || !result.pdfBase64) {
            const logTail = (result.log || "").slice(-8000);
            setStatus("error", "Erro ao compilar");
            touchAutosaveHint("Compilação falhou");
            setCompileLog(logTail || result.message || "Sem log");
            if (!auto) {
                setLogOpen(true, { focus: true });
            }
            setPdfBusy(false);
            if (!viewerPdfPath) {
                showViewerMessage(
                    "Falha na compilação",
                    `<p>${escapeHtml(result.message || "Veja o painel Logs.")}</p>
                     <p>Compilando: <code>${escapeHtml(mainPath)}</code></p>`
                );
            }
            return;
        }

        const pdfBytes = base64ToUint8Array(result.pdfBase64);
        const savedPath = await fs.saveCompiledPdf(mainPath, pdfBytes);
        explorer.render();
        setCompileLog(result.log || "Compilação concluída.");
        if (!auto) {
            setLogOpen(false);
        }
        await renderPdfViewer(savedPath);
        setStatus("idle", "PDF atualizado");
        touchAutosaveHint(`PDF: ${baseName(savedPath)} · main ${mainPath}`);
    } catch (error) {
        console.error("Erro ao compilar PDF:", error);
        setStatus("error", "Falha na API");
        setPdfBusy(false);
        if (!auto) {
            showViewerMessage("Erro", `<p>${escapeHtml(error.message || "Falha ao compilar.")}</p>`);
            window.alert(error.message || "Não foi possível compilar o projeto.");
        }
    } finally {
        compileInFlight = false;
        els.btnExportPdf.disabled = false;
        setPdfBusy(false);
        if (compileQueued) {
            compileQueued = false;
            scheduleAutoCompile();
        }
    }
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

async function renameActiveFile(nextName) {
    const path = fs.getActivePath();
    if (!path || !fs.isOpen()) {
        return;
    }
    if (fs.isPdf(path)) {
        const desired = nextName.trim().toLowerCase().endsWith(".pdf")
            ? nextName.trim()
            : `${nextName.trim().replace(/\.pdf$/i, "")}.pdf`;
        if (desired === baseName(path)) {
            syncDocNameInput(path);
            return;
        }
        try {
            const renamed = await fs.renamePath(path, desired);
            syncDocNameInput(renamed);
            explorer.render();
            touchAutosaveHint();
            setStatus("idle", "Renomeado");
        } catch (error) {
            window.alert(error.message || "Não foi possível renomear.");
            syncDocNameInput(path);
        }
        return;
    }

    const desired = ensureTexExtension(nextName);
    if (desired === baseName(path)) {
        syncDocNameInput(path);
        return;
    }
    try {
        const renamed = await fs.renamePath(path, desired);
        syncDocNameInput(renamed);
        explorer.render();
        touchAutosaveHint();
        setStatus("idle", "Renomeado");
    } catch (error) {
        window.alert(error.message || "Não foi possível renomear.");
        syncDocNameInput(path);
    }
}

function insertImport(targetPath, kind) {
    if (!fs.isOpen() || !fs.getActivePath() || !fs.isTextFile(fs.getActivePath())) {
        window.alert("Abra um arquivo .tex para inserir o import.");
        return;
    }
    const relative = fs.relativeImportPath(fs.getActivePath(), targetPath);
    const command = kind === "include" ? "\\include" : "\\input";
    insertAtCursor(els.editor, `${command}{${relative}}`);
    markDirty(true);
    refreshEditorChrome();
}

function initSplitter(splitterEl, cssVar, min, max, getRatio, getBounds) {
    let dragging = false;

    const apply = (clientX) => {
        const bounds = getBounds ? getBounds() : els.workspace.getBoundingClientRect();
        const ratio = Math.min(max, Math.max(min, (clientX - bounds.left) / bounds.width));
        document.documentElement.style.setProperty(cssVar, String(ratio));
    };

    splitterEl.addEventListener("pointerdown", (event) => {
        dragging = true;
        splitterEl.classList.add("is-dragging");
        document.body.classList.add("is-resizing");
        splitterEl.setPointerCapture(event.pointerId);
    });

    splitterEl.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }
        apply(event.clientX);
    });

    const endDrag = (event) => {
        if (!dragging) {
            return;
        }
        dragging = false;
        splitterEl.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");
        if (splitterEl.hasPointerCapture?.(event.pointerId)) {
            splitterEl.releasePointerCapture(event.pointerId);
        }
    };

    splitterEl.addEventListener("pointerup", endDrag);
    splitterEl.addEventListener("pointercancel", endDrag);

    splitterEl.addEventListener("keydown", (event) => {
        const current = getRatio();
        if (event.key === "ArrowLeft") {
            document.documentElement.style.setProperty(cssVar, String(Math.max(min, current - 0.02)));
            event.preventDefault();
        }
        if (event.key === "ArrowRight") {
            document.documentElement.style.setProperty(cssVar, String(Math.min(max, current + 0.02)));
            event.preventDefault();
        }
    });
}

const explorer = createExplorer({
    rootEl: els.explorer,
    treeEl: els.explorerTree,
    titleEl: els.projectTitle,
    fs,
    onOpenFile: openFile,
    onTreeChanged: () => {
        explorer.render();
        touchAutosaveHint();
    },
    onInsertImport: insertImport,
    onRequestConfirm: async (message) => window.confirm(message),
    onRequireFolder: openProjectFolder,
});

function bindEvents() {
    els.editor.addEventListener("input", () => {
        if (els.editor.readOnly) {
            return;
        }
        markDirty(true);
        refreshEditorChrome();
        scheduleAutoCompile();
    });

    els.editor.addEventListener("scroll", () => {
        els.lineNumbers.scrollTop = els.editor.scrollTop;
    });
    els.editor.addEventListener("click", () => {
        updateCursorMeta(els.editor, els.cursorPos, els.charCount);
    });
    els.editor.addEventListener("keyup", () => {
        updateCursorMeta(els.editor, els.cursorPos, els.charCount);
    });
    els.editor.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || els.editor.readOnly) {
            return;
        }
        event.preventDefault();
        insertTab(els.editor);
        markDirty(true);
        refreshEditorChrome();
    });

    els.btnSave.addEventListener("click", () => saveDocument());
    els.btnTheme.addEventListener("click", () => {
        toggleTheme();
        syncThemeToggle(els.btnTheme);
    });
    els.btnOpenFolder.addEventListener("click", openProjectFolder);
    els.btnExportPdf.addEventListener("click", compilePdf);
    els.btnToggleExplorer.addEventListener("click", () => {
        explorerOpen = !explorerOpen;
        applyExplorerVisibility();
    });
    els.btnToggleLog.addEventListener("click", () => {
        setLogOpen(!logOpen);
    });
    els.btnCloseLog.addEventListener("click", () => {
        setLogOpen(false);
    });
    els.layoutButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            layoutMode = btn.dataset.layout;
            applyLayoutMode();
        });
    });

    els.docName.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            suppressNameBlur = true;
            renameActiveFile(els.docName.value);
            els.editor.focus();
            window.setTimeout(() => {
                suppressNameBlur = false;
            }, 0);
        }
        if (event.key === "Escape") {
            syncDocNameInput(fs.getActivePath());
            els.editor.focus();
        }
    });

    els.docName.addEventListener("blur", () => {
        if (suppressNameBlur) {
            return;
        }
        renameActiveFile(els.docName.value);
    });

    document.addEventListener("keydown", (event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === "s") {
            event.preventDefault();
            saveDocument();
        }
        if (mod && event.key.toLowerCase() === "n") {
            event.preventDefault();
            createNewDocument();
        }
        if (mod && event.key.toLowerCase() === "o") {
            event.preventDefault();
            openProjectFolder();
        }
        if (mod && event.key.toLowerCase() === "b") {
            event.preventDefault();
            explorerOpen = !explorerOpen;
            applyExplorerVisibility();
        }
        if (mod && event.key === "Enter") {
            event.preventDefault();
            compilePdf();
        }
        if (event.key === "F2" && document.activeElement === els.editor) {
            event.preventDefault();
            els.docName.focus();
            els.docName.select();
        }
    });
}

async function init() {
    applyTheme(getStoredTheme());
    syncThemeToggle(els.btnTheme);
    applyExplorerVisibility();
    applyLayoutMode();
    setLogOpen(false);
    fs.load();
    bindEvents();

    initSplitter(
        els.splitterSide,
        "--explorer-ratio",
        0.14,
        0.34,
        () =>
            Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--explorer-ratio")
            ) || 0.22
    );

    initSplitter(
        els.splitter,
        "--split-ratio",
        0.28,
        0.72,
        () =>
            Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--split-ratio")
            ) || 0.5,
        () => {
            const workspaceRect = els.workspace.getBoundingClientRect();
            const sideWidth = explorerOpen
                ? els.explorer.getBoundingClientRect().width +
                  els.splitterSide.getBoundingClientRect().width
                : 0;
            return {
                left: workspaceRect.left + sideWidth,
                width: Math.max(1, workspaceRect.width - sideWidth),
            };
        }
    );

    if (!fs.supportsNativeFolder()) {
        els.btnOpenFolder.title = "Disponível no Chrome/Edge";
        els.btnOpenFolder.disabled = true;
    }

    updateWorkspaceModeLabel();
    explorer.render();
    showWelcomeViewer();

    const restored = await fs.tryRestoreFolder();
    if (restored) {
        updateWorkspaceModeLabel();
        explorer.render();
        const active = fs.getActivePath();
        if (active) {
            await openFile(active, { force: true });
        }
        touchAutosaveHint(`Pasta restaurada: ${fs.getName()}`);
    }
}

init();
