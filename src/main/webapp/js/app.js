import {
    DEFAULT_PROJECT_MAIN,
    insertAtCursor,
    insertTab,
    updateCursorMeta,
    updateLineNumbers,
} from "./editor.js";
import { createAutocomplete } from "./autocomplete.js";
import { createExplorer } from "./explorer.js";
import { syncThemeToggle, toggleTheme } from "./theme.js";
import { applyEditorWordWrap, applySettingsToAppearance, createSettingsPage, loadSettings, saveSettings } from "./settings.js";
import { bindTemplateExpansion } from "./templates.js";
import { bindSyntaxHighlight } from "./highlight.js";
import { WorkspaceFs, baseName, parentPath } from "./workspace-fs.js";
import { checkHealth, compileProject, getApiBase } from "./api.js";
import { PdfViewer } from "./pdf-viewer.js";

const els = {
    editor: document.getElementById("editor"),
    editorHighlight: document.getElementById("editor-highlight"),
    lineNumbers: document.getElementById("line-numbers"),
    preview: document.getElementById("preview"),
    previewMode: document.getElementById("preview-mode"),
    cursorPos: document.getElementById("cursor-pos"),
    charCount: document.getElementById("char-count"),
    statusSync: document.getElementById("status-sync"),
    statusSyncLabel: document.getElementById("status-sync-label"),
    projectName: document.getElementById("project-name"),
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
    btnDownloadPdf: document.getElementById("btn-download-pdf"),
    downloadMenu: document.getElementById("download-menu"),
    downloadMenuWrap: document.getElementById("download-menu-wrap"),
    btnToggleExplorer: document.getElementById("btn-toggle-explorer"),
    btnToggleLog: document.getElementById("btn-toggle-log"),
    btnCopyLog: document.getElementById("btn-copy-log"),
    btnCloseLog: document.getElementById("btn-close-log"),
    btnTheme: document.getElementById("btn-theme"),
    btnSettings: document.getElementById("btn-settings"),
    settingsModal: document.getElementById("settings-modal"),
    settingWordWrap: document.getElementById("setting-word-wrap"),
    settingThemeMode: document.getElementById("setting-theme-mode"),
    accentPresetList: document.getElementById("accent-preset-list"),
    settingAccentCustom: document.getElementById("setting-accent-custom"),
    templateList: document.getElementById("template-list"),
    btnAddTemplate: document.getElementById("btn-add-template"),
    templateEditor: document.getElementById("template-editor"),
    templateEditorName: document.getElementById("template-editor-name"),
    templateEditorBody: document.getElementById("template-editor-body"),
    layoutButtons: [...document.querySelectorAll(".layout-btn")],
    btnLayoutMenu: document.getElementById("btn-layout-menu"),
    layoutMenu: document.getElementById("layout-menu"),
    railLayout: document.getElementById("rail-layout"),
    pdfZoom: document.getElementById("pdf-zoom"),
    btnPdfZoomIn: document.getElementById("btn-pdf-zoom-in"),
    btnPdfZoomOut: document.getElementById("btn-pdf-zoom-out"),
    pdfZoomValue: document.getElementById("pdf-zoom-value"),
    inputTex: document.getElementById("input-tex"),
    inputPdf: document.getElementById("input-pdf"),
    folderModal: document.getElementById("folder-modal"),
    folderModalRoot: document.getElementById("folder-modal-root"),
    folderModalPath: document.getElementById("folder-modal-path"),
    folderModalList: document.getElementById("folder-modal-list"),
    folderModalUp: document.getElementById("folder-modal-up"),
    folderModalNew: document.getElementById("folder-modal-new"),
    folderModalOpen: document.getElementById("folder-modal-open"),
};

const fs = new WorkspaceFs();
const pdfViewer = new PdfViewer();
let isDirty = false;
let suppressNameBlur = false;
let viewerPdfPath = "";
let explorerOpen = localStorage.getItem("latexedit.explorerOpen") !== "0";
let logOpen = false;
let copyLogResetTimer = null;
let layoutMode = localStorage.getItem("latexedit.layout") || "split";
if (!["split", "editor", "pdf"].includes(layoutMode)) {
    layoutMode = "split";
}
let pdfResizeObserver = null;
let pdfFitTimer = null;

const AUTO_COMPILE_MS = 2200;
let autoCompileTimer = null;
let compileInFlight = false;
let compileQueued = false;

function setStatus(state, label) {
    els.statusSync.dataset.state = state;
    els.statusSync.title = label;
    els.statusSync.setAttribute("aria-label", label);
    if (els.statusSyncLabel) {
        els.statusSyncLabel.textContent = label;
    }
}

function markDirty(dirty) {
    isDirty = dirty;
    setStatus(dirty ? "dirty" : "idle", dirty ? "Não salvo" : "Pronto");
}

function refreshEditorChrome() {
    updateLineNumbers(els.editor, els.lineNumbers);
    updateCursorMeta(els.editor, els.cursorPos, els.charCount);
    syntaxHighlight?.paint();
}

function syncProjectNameInput() {
    els.projectName.value = fs.isOpen() ? fs.getName() : "";
    els.projectName.title = fs.isOpen() ? `Projeto: ${fs.getProjectRoot()}` : "Sem projeto";
    els.projectName.disabled = !fs.isOpen();
}

function updateWorkspaceModeLabel() {
    els.workspaceMode.textContent = fs.isOpen()
        ? `NAS: ${fs.getName()}`
        : "Nenhuma pasta no NAS";
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

function setLayoutMenuOpen(open) {
    if (!els.layoutMenu || !els.btnLayoutMenu) {
        return;
    }
    els.layoutMenu.hidden = !open;
    els.btnLayoutMenu.setAttribute("aria-expanded", String(open));
    els.btnLayoutMenu.classList.toggle("is-open", open);
}

function syncLayoutTriggerIcon() {
    if (!els.btnLayoutMenu) {
        return;
    }
    els.btnLayoutMenu.querySelectorAll("[data-layout-icon]").forEach((icon) => {
        icon.classList.toggle("is-current", icon.getAttribute("data-layout-icon") === layoutMode);
    });
    const labels = { split: "Split", editor: "Script", pdf: "Preview" };
    const label = labels[layoutMode] || "Layout";
    els.btnLayoutMenu.dataset.currentLayout = layoutMode;
    els.btnLayoutMenu.title = `Layout: ${label}`;
    els.btnLayoutMenu.setAttribute("aria-label", `Layout atual: ${label}. Abrir opções`);
}

function updatePdfZoomLabel(percent, fitMode) {
    if (!els.pdfZoomValue) {
        return;
    }
    els.pdfZoomValue.value = percent;
    els.pdfZoomValue.title =
        fitMode === "width"
            ? "Ajustado à largura — digite um valor ou use +/−"
            : "Digite o zoom ou use +/−";
}

async function applyPdfZoomFromInput() {
    if (!pdfViewer.pdf || !els.pdfZoomValue) {
        return;
    }
    const raw = Number(els.pdfZoomValue.value);
    if (!Number.isFinite(raw)) {
        updatePdfZoomLabel(pdfViewer.getScalePercent(), pdfViewer.fitMode);
        return;
    }
    const percent = Math.min(300, Math.max(50, Math.round(raw)));
    els.pdfZoomValue.value = percent;
    await pdfViewer.setScale(percent / 100);
}

function setPdfZoomVisible(visible) {
    if (els.pdfZoom) {
        els.pdfZoom.hidden = !visible;
    }
}

function schedulePdfFit() {
    if (!pdfViewer.pdf || !els.preview.classList.contains("is-pdf")) {
        return;
    }
    window.clearTimeout(pdfFitTimer);
    pdfFitTimer = window.setTimeout(() => {
        if (pdfViewer.fitMode === "manual") {
            return;
        }
        pdfViewer.fitWidth().catch((error) => {
            console.warn("Falha ao reajustar PDF:", error);
        });
    }, 120);
}

function watchPdfHost(host) {
    if (pdfResizeObserver) {
        pdfResizeObserver.disconnect();
        pdfResizeObserver = null;
    }
    if (!host || typeof ResizeObserver === "undefined") {
        return;
    }
    pdfResizeObserver = new ResizeObserver(() => {
        schedulePdfFit();
    });
    pdfResizeObserver.observe(host);
}

function applyLayoutMode() {
    els.workspace.classList.remove("layout-split", "layout-editor", "layout-pdf");
    els.workspace.classList.add(`layout-${layoutMode}`);
    els.layoutButtons.forEach((btn) => {
        const active = btn.dataset.layout === layoutMode;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-checked", String(active));
    });
    syncLayoutTriggerIcon();
    localStorage.setItem("latexedit.layout", layoutMode);
    if (layoutMode === "pdf" && pdfViewer.pdf) {
        window.requestAnimationFrame(() => {
            pdfViewer.fitWidth().catch(() => {});
        });
    }
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

async function copyCompileLog() {
    const text = els.logBody.textContent ?? "";
    if (!text.trim()) {
        return;
    }
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            copyTextFallback(text);
        }
        flashCopyLogSuccess();
    } catch (err) {
        try {
            copyTextFallback(text);
            flashCopyLogSuccess();
        } catch (fallbackErr) {
            console.error("Não foi possível copiar o log", fallbackErr);
        }
    }
}

function copyTextFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) {
        throw new Error("execCommand copy failed");
    }
}

function flashCopyLogSuccess() {
    const btn = els.btnCopyLog;
    if (!btn) {
        return;
    }
    const icon = btn.querySelector("i");
    btn.classList.add("is-copied");
    btn.title = "Copiado";
    btn.setAttribute("aria-label", "Log copiado");
    if (icon) {
        icon.className = "fa-solid fa-check";
    }
    clearTimeout(copyLogResetTimer);
    copyLogResetTimer = setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.title = "Copiar log";
        btn.setAttribute("aria-label", "Copiar texto do log");
        if (icon) {
            icon.className = "fa-regular fa-copy";
        }
    }, 1600);
}

function showViewerMessage(title, bodyHtml) {
    viewerPdfPath = "";
    pdfViewer.clear();
    setPdfZoomVisible(false);
    if (pdfResizeObserver) {
        pdfResizeObserver.disconnect();
        pdfResizeObserver = null;
    }
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
        "Abra a pasta do projeto no NAS",
        `
          <p>Os arquivos ficam no <strong>servidor</strong> (volume Docker), não no PC do navegador.</p>
          <p>Abra uma pasta, edite o <code>.tex</code> e aguarde o auto-compile (~2s) ou use <strong>Ctrl+Enter</strong>. Baixe o PDF pelo ícone na barra superior.</p>
          <button type="button" class="btn btn-primary" id="welcome-open-folder">Abrir pasta no NAS</button>
        `
    );
    els.preview.querySelector("#welcome-open-folder")?.addEventListener("click", () => {
        openProjectFolder();
    });
    setEditorEnabled(false);
    els.editor.value = "% Abra uma pasta do NAS para começar.\n";
    refreshEditorChrome();
}

async function renderPdfViewer(path) {
    try {
        fs.revokePdfUrl(path);
        const url = await fs.getPdfObjectUrl(path);
        viewerPdfPath = path;
        els.previewMode.textContent = baseName(path);
        els.preview.classList.add("is-pdf");
        els.preview.innerHTML = `
            <div class="pdf-stage">
              <div class="pdf-busy" id="pdf-busy" hidden>Atualizando PDF…</div>
              <div class="pdfjs-host" id="pdfjs-host"></div>
            </div>
        `;
        const host = document.getElementById("pdfjs-host");
        pdfViewer.onScaleChange = (percent, fitMode) => {
            updatePdfZoomLabel(percent, fitMode);
        };
        await pdfViewer.open(host, url, { fit: "width" });
        setPdfZoomVisible(true);
        updatePdfZoomLabel(pdfViewer.getScalePercent(), pdfViewer.fitMode);
        watchPdfHost(host);
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
          <p>A geração grava o PDF no NAS. Aguarde o auto-compile ~2s após digitar ou use <strong>Ctrl+Enter</strong>.</p>
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
    els.autosaveHint.textContent = fs.isOpen() ? `NAS · ${stamp}` : "Sem pasta no NAS";
}

function ensureFolderOrWarn() {
    if (fs.isOpen()) {
        return true;
    }
    window.alert("Abra uma pasta do NAS na barra de arquivos antes de continuar.");
    return false;
}

let folderBrowserPath = "";
let workspaceAbsoluteRoot = "";

function closeFolderModal() {
    if (els.folderModal) {
        els.folderModal.hidden = true;
    }
}

function joinWorkspacePath(parent, name) {
    const base = parent ? parent.replace(/\/+$/, "") : "";
    const leaf = String(name || "").trim().replace(/^\/+|\/+$/g, "");
    return base ? `${base}/${leaf}` : leaf;
}

async function refreshFolderModal() {
    els.folderModalPath.textContent = folderBrowserPath ? `/${folderBrowserPath}` : "/";
    if (els.folderModalRoot) {
        els.folderModalRoot.textContent = workspaceAbsoluteRoot || "…";
        els.folderModalRoot.title = workspaceAbsoluteRoot || "";
    }
    els.folderModalList.innerHTML = `<p class="modal-loading">Carregando…</p>`;
    try {
        const items = await fs.listServerDir(folderBrowserPath);
        const dirs = items.filter((i) => i.type === "dir");
        if (dirs.length === 0) {
            els.folderModalList.innerHTML = `
                <div class="modal-empty">
                    <p>Nenhuma subpasta aqui.</p>
                    <p>Crie um projeto com <strong>Nova pasta</strong> ou abra este nível mesmo assim.</p>
                    <button type="button" class="btn btn-secondary" id="folder-modal-empty-new">＋ Nova pasta</button>
                </div>`;
            els.folderModalList.querySelector("#folder-modal-empty-new")?.addEventListener("click", () => {
                createFolderInBrowser();
            });
            return;
        }
        els.folderModalList.innerHTML = dirs
            .map(
                (dir) => `
            <button type="button" class="modal-row" data-path="${escapeHtml(dir.path)}" title="Clique para entrar · duplo clique para abrir">
              <span class="modal-row-icon" aria-hidden="true">DIR</span>
              <span>${escapeHtml(dir.name)}</span>
            </button>`
            )
            .join("");
    } catch (error) {
        els.folderModalList.innerHTML = `<p class="modal-empty">${escapeHtml(error.message || "Falha ao listar pastas.")}</p>`;
    }
}

async function createFolderInBrowser() {
    const suggested = "meu-projeto";
    const raw = window.prompt("Nome da nova pasta de projeto:", suggested);
    if (raw == null) {
        return;
    }
    const name = raw.trim().replace(/[\\/]+/g, "-").replace(/^\.+/, "");
    if (!name) {
        window.alert("Informe um nome válido para a pasta.");
        return;
    }
    const atWorkspaceRoot = !folderBrowserPath;
    const path = joinWorkspacePath(folderBrowserPath, name);
    try {
        await fs.mkdirAtWorkspace(path);
        if (atWorkspaceRoot) {
            await fs.createFileAtWorkspace(`${path}/main.tex`, DEFAULT_PROJECT_MAIN);
        }
        folderBrowserPath = path;
        await refreshFolderModal();
        setStatus("idle", atWorkspaceRoot ? "Projeto criado com main.tex" : "Pasta criada");
    } catch (error) {
        console.error("Erro ao criar pasta:", error);
        window.alert(error.message || "Não foi possível criar a pasta.");
    }
}

async function openProjectFolder() {
    try {
        await checkHealth();
        try {
            const info = await fs.getWorkspaceInfo();
            workspaceAbsoluteRoot = info.absoluteRoot || info.workspaceRoot || "";
        } catch (infoError) {
            console.warn("Não foi possível ler info do workspace:", infoError);
            workspaceAbsoluteRoot = "";
        }
    } catch (error) {
        window.alert(`Backend indisponível em ${getApiBase()}\n\n${error.message || ""}`);
        return;
    }
    folderBrowserPath = "";
    els.folderModal.hidden = false;
    await refreshFolderModal();
}

async function confirmOpenServerFolder() {
    try {
        if (isDirty && !window.confirm("Alterações não salvas serão descartadas. Continuar?")) {
            return;
        }
        await fs.openServerFolder(folderBrowserPath);
        closeFolderModal();
        if (!explorerOpen) {
            explorerOpen = true;
            applyExplorerVisibility();
        }
        updateWorkspaceModeLabel();
        syncProjectNameInput();
        explorer.render();
        const active = fs.getActivePath();
        if (active) {
            await openFile(active, { force: true });
        } else {
            syncProjectNameInput();
            setEditorEnabled(false);
            els.editor.value = "% Pasta vazia — crie um arquivo .tex\n";
            refreshEditorChrome();
            showViewerMessage("Pasta vazia", "<p>Crie um arquivo .tex na navegação.</p>");
            markDirty(false);
        }
        touchAutosaveHint(`Pasta NAS: ${fs.getName()}`);
        setStatus("idle", "Pasta aberta");
        scheduleAutoCompile();
    } catch (error) {
        console.error("Erro ao abrir pasta NAS:", error);
        window.alert(error.message || "Não foi possível abrir a pasta no NAS.");
    }
}

async function openFile(path, { force = false } = {}) {
    if (!path) {
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
            const content = await fs.readFile(path);
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
            setStatus("idle", "Salvo no NAS");
        }
        explorer.render();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        setStatus("error", "Falha ao salvar");
        window.alert(error.message || "Não foi possível salvar o arquivo no NAS.");
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
        setPdfBusy(false);
        setStatus("error", "Sem backend");
        showViewerMessage(
            "Backend indisponível",
            `<p>Não foi possível conectar em <code>${getApiBase()}</code>.</p>
             <p>Verifique o container LaTeX IDE no NAS.</p>`
        );
        if (!auto) {
            window.alert(`Backend indisponível em ${getApiBase()}`);
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

        if (!result.success || (!result.pdfBase64 && !result.pdfPath)) {
            const logTail = (result.log || "").slice(-8000);
            setStatus("error", "Erro ao gerar PDF");
            touchAutosaveHint("Geração falhou");
            setCompileLog(logTail || result.message || "Sem log");
            setPdfBusy(false);
            if (!auto) {
                setLogOpen(true, { focus: true });
            }
            // Não mantém PDF antigo como se fosse o resultado atual
            showViewerMessage(
                "Falha na geração",
                `<p>${escapeHtml(result.message || "Veja o painel Logs.")}</p>
                 <p>Compilando: <code>${escapeHtml(mainPath)}</code></p>
                 <p class="hint">O preview anterior foi descartado para não exibir PDF desatualizado.</p>`
            );
            return;
        }

        const savedPath = await fs.saveCompiledPdf(mainPath, null, result.pdfPath);
        // Força novo blob (sem cache do PDF anterior)
        fs.revokePdfUrl(savedPath);
        await fs.refreshTree();
        explorer.render();
        setCompileLog(result.log || "PDF gerado no NAS.");
        if (!auto) {
            setLogOpen(false);
        }
        await renderPdfViewer(savedPath);
        setStatus("idle", "PDF no NAS");
        touchAutosaveHint(`PDF no NAS: ${baseName(savedPath)} · main ${mainPath}`);
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        setStatus("error", "Falha na API");
        setPdfBusy(false);
        if (!auto) {
            showViewerMessage("Erro", `<p>${escapeHtml(error.message || "Falha ao gerar PDF.")}</p>`);
            window.alert(error.message || "Não foi possível gerar o PDF no NAS.");
        }
    } finally {
        compileInFlight = false;
        setPdfBusy(false);
        if (compileQueued) {
            compileQueued = false;
            scheduleAutoCompile();
        }
    }
}

async function triggerBlobDownload(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
}

function setDownloadMenuOpen(open) {
    if (!els.downloadMenu || !els.btnDownloadPdf) {
        return;
    }
    els.downloadMenu.hidden = !open;
    els.btnDownloadPdf.setAttribute("aria-expanded", String(open));
    els.btnDownloadPdf.classList.toggle("is-open", open);
}

async function downloadPdfFromServer() {
    if (!ensureFolderOrWarn()) {
        return;
    }
    const main = fs.resolveMainDocument(fs.getActivePath());
    const pdfPath = (main && fs.findCompanionPdf(main)) || viewerPdfPath;
    if (!pdfPath || !fs.isPdf(pdfPath)) {
        window.alert("Aguarde a geração do PDF ou use Ctrl+Enter para compilar antes de baixar.");
        return;
    }
    try {
        const url = fs.pdfFileUrl(pdfPath);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download HTTP ${response.status}`);
        }
        const blob = await response.blob();
        await triggerBlobDownload(blob, baseName(pdfPath) || "documento.pdf");
        setStatus("idle", "PDF baixado");
    } catch (error) {
        console.error(error);
        window.alert(error.message || "Falha ao baixar o PDF do servidor.");
    }
}

async function downloadProjectZip() {
    if (!ensureFolderOrWarn()) {
        return;
    }
    try {
        if (isDirty) {
            await saveDocument({ silent: true });
        }
        const project = fs.getProjectRoot();
        const url = `${getApiBase()}/api/fs/zip?path=${encodeURIComponent(project)}&t=${Date.now()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const zipName = `${fs.getName() || "projeto"}.zip`;
        await triggerBlobDownload(blob, zipName);
        setStatus("idle", "ZIP baixado");
    } catch (error) {
        console.error(error);
        window.alert(error.message || "Falha ao baixar o ZIP do projeto.");
    }
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

async function renameProject(nextName) {
    if (!fs.isOpen()) {
        return;
    }
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === fs.getName()) {
        syncProjectNameInput();
        return;
    }
    try {
        await fs.renameProject(trimmed);
        syncProjectNameInput();
        updateWorkspaceModeLabel();
        explorer.render();
        touchAutosaveHint(`Projeto renomeado: ${fs.getName()}`);
        setStatus("idle", "Projeto renomeado");
    } catch (error) {
        window.alert(error.message || "Não foi possível renomear o projeto.");
        syncProjectNameInput();
    }
}

function insertImport(targetPath, kind) {
    if (!fs.isOpen() || !fs.getActivePath() || !fs.isTextFile(fs.getActivePath())) {
        window.alert("Abra um arquivo .tex para inserir o import.");
        return;
    }
    const relative = fs.relativeImportPath(fs.getActivePath(), targetPath);
    if (/[^\x00-\x7F]/.test(relative)) {
        const ok = window.confirm(
            `O caminho "${relative}" tem acentos ou ç.\n` +
                "O pdfLaTeX costuma falhar com isso em \\input/\\include.\n\n" +
                "Recomendação: renomeie para ASCII (ex.: Explicacao.tex).\n\n" +
                "Inserir mesmo assim?"
        );
        if (!ok) {
            return;
        }
    }
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

const autocomplete = createAutocomplete({
    editor: els.editor,
    getProjectTexPaths: () =>
        Object.keys(fs.workspace?.entries || {}).filter((path) => /\.tex$/i.test(path)),
    getTemplates: () => loadSettings().templates || {},
});

const syntaxHighlight = bindSyntaxHighlight(els.editor, els.editorHighlight);

function applySettingsToUi(settings) {
    applyEditorWordWrap(els.editor, settings.wordWrap);
    els.editorHighlight?.classList.toggle("is-word-wrap", Boolean(settings.wordWrap));
    applySettingsToAppearance(settings);
    syncThemeToggle(els.btnTheme);
    syntaxHighlight?.paint();
}

const settingsPage = createSettingsPage({
    modalEl: els.settingsModal,
    openBtn: els.btnSettings,
    wordWrapInput: els.settingWordWrap,
    themeModeSelect: els.settingThemeMode,
    accentPresetContainer: els.accentPresetList,
    accentCustomInput: els.settingAccentCustom,
    templateListEl: els.templateList,
    btnAddTemplate: els.btnAddTemplate,
    templateEditorEl: els.templateEditor,
    templateNameInput: els.templateEditorName,
    templateBodyInput: els.templateEditorBody,
    onChange: (settings) => {
        applySettingsToUi(settings);
        refreshEditorChrome();
    },
});

bindTemplateExpansion(
    els.editor,
    () => loadSettings().templates || {},
    () => {
        markDirty(true);
        refreshEditorChrome();
        scheduleAutoCompile();
        autocomplete.refresh();
    }
);

function bindEvents() {
    els.editor.addEventListener("input", () => {
        if (els.editor.readOnly) {
            return;
        }
        markDirty(true);
        refreshEditorChrome();
        scheduleAutoCompile();
        autocomplete.refresh();
    });

    els.editor.addEventListener("scroll", () => {
        els.lineNumbers.scrollTop = els.editor.scrollTop;
    });
    els.editor.addEventListener("click", () => {
        updateCursorMeta(els.editor, els.cursorPos, els.charCount);
        autocomplete.hide();
    });
    els.editor.addEventListener("keyup", () => {
        updateCursorMeta(els.editor, els.cursorPos, els.charCount);
    });
    els.editor.addEventListener("keydown", (event) => {
        if (autocomplete.onKeyDown(event)) {
            refreshEditorChrome();
            return;
        }
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
        const next = toggleTheme();
        saveSettings({ themeMode: next });
        if (els.settingThemeMode) {
            els.settingThemeMode.value = next;
        }
        syncThemeToggle(els.btnTheme);
    });
    els.btnOpenFolder.addEventListener("click", openProjectFolder);
    els.btnDownloadPdf?.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = els.downloadMenu?.hidden !== false;
        setDownloadMenuOpen(open);
    });
    els.downloadMenu?.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-download]");
        if (!item) {
            return;
        }
        event.preventDefault();
        setDownloadMenuOpen(false);
        if (item.dataset.download === "zip") {
            await downloadProjectZip();
            return;
        }
        if (item.dataset.download === "pdf") {
            await downloadPdfFromServer();
        }
    });
    document.addEventListener("pointerdown", (event) => {
        if (!els.downloadMenu || els.downloadMenu.hidden) {
            return;
        }
        if (els.downloadMenuWrap?.contains(event.target)) {
            return;
        }
        setDownloadMenuOpen(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && els.downloadMenu && !els.downloadMenu.hidden) {
            setDownloadMenuOpen(false);
        }
    });
    els.btnPdfZoomIn?.addEventListener("click", async () => {
        if (!pdfViewer.pdf) {
            return;
        }
        await pdfViewer.zoomIn();
    });
    els.btnPdfZoomOut?.addEventListener("click", async () => {
        if (!pdfViewer.pdf) {
            return;
        }
        await pdfViewer.zoomOut();
    });
    els.pdfZoomValue?.addEventListener("focus", (event) => {
        event.target.select();
    });
    els.pdfZoomValue?.addEventListener("change", () => {
        applyPdfZoomFromInput();
    });
    els.pdfZoomValue?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyPdfZoomFromInput();
            event.target.blur();
        }
    });

    els.folderModal?.querySelectorAll("[data-close-modal]").forEach((el) => {
        el.addEventListener("click", closeFolderModal);
    });
    els.folderModalUp?.addEventListener("click", async () => {
        folderBrowserPath = parentPath(folderBrowserPath);
        await refreshFolderModal();
    });
    els.folderModalNew?.addEventListener("click", () => createFolderInBrowser());
    els.folderModalOpen?.addEventListener("click", confirmOpenServerFolder);
    els.folderModalList?.addEventListener("click", async (event) => {
        const row = event.target.closest("[data-path]");
        if (!row) {
            return;
        }
        folderBrowserPath = row.dataset.path;
        await refreshFolderModal();
    });
    els.folderModalList?.addEventListener("dblclick", async (event) => {
        const row = event.target.closest("[data-path]");
        if (!row) {
            return;
        }
        folderBrowserPath = row.dataset.path;
        await confirmOpenServerFolder();
    });

    els.btnToggleExplorer.addEventListener("click", () => {
        explorerOpen = !explorerOpen;
        applyExplorerVisibility();
    });
    els.btnToggleLog.addEventListener("click", () => {
        setLogOpen(!logOpen);
    });
    els.btnCopyLog?.addEventListener("click", () => {
        copyCompileLog();
    });
    els.btnCloseLog.addEventListener("click", () => {
        setLogOpen(false);
    });
    els.btnLayoutMenu?.addEventListener("click", (event) => {
        event.stopPropagation();
        setLayoutMenuOpen(els.layoutMenu.hidden);
    });
    els.layoutButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            layoutMode = btn.dataset.layout;
            applyLayoutMode();
            setLayoutMenuOpen(false);
        });
    });
    document.addEventListener("click", (event) => {
        if (!els.railLayout || els.layoutMenu?.hidden) {
            return;
        }
        if (!els.railLayout.contains(event.target)) {
            setLayoutMenuOpen(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && els.layoutMenu && !els.layoutMenu.hidden) {
            setLayoutMenuOpen(false);
        }
    });

    els.projectName.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            suppressNameBlur = true;
            await renameProject(els.projectName.value);
            els.editor.focus();
            window.setTimeout(() => {
                suppressNameBlur = false;
            }, 0);
        }
        if (event.key === "Escape") {
            syncProjectNameInput();
            els.editor.focus();
        }
    });

    els.projectName.addEventListener("blur", () => {
        if (suppressNameBlur) {
            return;
        }
        renameProject(els.projectName.value);
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
        if (event.key === "F2") {
            event.preventDefault();
            els.projectName.focus();
            els.projectName.select();
        }
    });
}

async function init() {
    const settings = loadSettings();
    applySettingsToUi(settings);
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
        els.btnOpenFolder.title = "Abrir pasta no NAS";
    }

    updateWorkspaceModeLabel();
    explorer.render();
    showWelcomeViewer();

    const restored = await fs.tryRestoreFolder();
    if (restored) {
        updateWorkspaceModeLabel();
        syncProjectNameInput();
        explorer.render();
        const active = fs.getActivePath();
        if (active) {
            await openFile(active, { force: true });
        }
        touchAutosaveHint(`Pasta NAS restaurada: ${fs.getName()}`);
    }
}

init();
