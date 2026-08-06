const WORKSPACE_KEY = "latexedit.workspace.v1";
const HANDLE_DB = "latexedit.fs";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "root";

const TEXT_EXT = /\.(tex|bib|sty|cls|txt|md)$/i;
const PDF_EXT = /\.pdf$/i;
const BINARY_EXT = /\.(pdf|png|jpg|jpeg|eps)$/i;
const SUPPORTED_EXT = /\.(tex|bib|sty|cls|txt|md|pdf|png|jpg|jpeg|eps)$/i;

export const SAMPLE_MAIN = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\title{Documento}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introdução}
Comece a editar este arquivo.

\\end{document}
`;

function normalizePath(path) {
    return String(path || "")
        .replaceAll("\\", "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

function parentPath(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? "" : normalized.slice(0, idx);
}

function baseName(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function joinPath(...parts) {
    return parts
        .map((part) => normalizePath(part))
        .filter(Boolean)
        .join("/");
}

function ensureTexExtension(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return "untitled.tex";
    }
    if (/\.[a-z0-9]+$/i.test(trimmed)) {
        return trimmed;
    }
    return `${trimmed}.tex`;
}

function fileKind(path) {
    if (PDF_EXT.test(path)) {
        return "pdf";
    }
    if (/\.(png|jpg|jpeg|eps)$/i.test(path)) {
        return "asset";
    }
    if (/\.bib$/i.test(path)) {
        return "bib";
    }
    if (/\.(sty|cls)$/i.test(path)) {
        return "sty";
    }
    return "tex";
}

function openHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HANDLE_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                db.createObjectStore(HANDLE_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveRootHandle(handle) {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function loadRootHandle() {
    const db = await openHandleDb();
    const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
}

async function clearRootHandle() {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

function emptyWorkspace(name = "sem-pasta") {
    return {
        name,
        activePath: "",
        expanded: { "": true },
        entries: {},
    };
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export class WorkspaceFs {
    constructor() {
        this.workspace = emptyWorkspace();
        this.nativeRoot = null;
        this.nativeHandles = new Map();
        this.mode = "idle";
        this.pdfUrls = new Map();
    }

    isOpen() {
        return this.mode === "native" && Boolean(this.nativeRoot);
    }

    supportsNativeFolder() {
        return typeof window.showDirectoryPicker === "function";
    }

    /**
     * Motivo legível quando showDirectoryPicker não está disponível.
     * Em HTTP fora de localhost o Chrome desliga a API (contexto inseguro).
     */
    nativeFolderBlockReason() {
        if (this.supportsNativeFolder()) {
            return null;
        }
        const isLocalhost =
            window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const isSecure = window.isSecureContext === true || isLocalhost;
        if (!isSecure) {
            return (
                "O navegador bloqueia abrir pastas do PC em HTTP da rede.\n\n" +
                "Use a URL HTTPS do app (ex.: https://192.168.0.3:8095/).\n" +
                "Na 1ª vez o Chrome avisa o certificado — avance em Avançado → Continuar."
            );
        }
        return "Seu navegador não oferece abertura de pasta local. Use Chrome ou Edge atualizado.";
    }

    getName() {
        return this.workspace.name;
    }

    getActivePath() {
        return this.workspace.activePath;
    }

    setActivePath(path) {
        const normalized = normalizePath(path);
        if (normalized && (!this.exists(normalized) || !this.isFile(normalized))) {
            return false;
        }
        this.workspace.activePath = normalized;
        return true;
    }

    exists(path) {
        return Boolean(this.workspace.entries[normalizePath(path)]);
    }

    isDir(path) {
        return this.workspace.entries[normalizePath(path)]?.type === "dir";
    }

    isFile(path) {
        return this.workspace.entries[normalizePath(path)]?.type === "file";
    }

    isPdf(path) {
        return this.workspace.entries[normalizePath(path)]?.kind === "pdf";
    }

    isTextFile(path) {
        const entry = this.workspace.entries[normalizePath(path)];
        return entry?.type === "file" && entry.kind !== "pdf" && entry.kind !== "asset";
    }

    readFile(path) {
        const normalized = normalizePath(path);
        const entry = this.workspace.entries[normalized];
        if (!entry || entry.type !== "file") {
            throw new Error(`Arquivo não encontrado: ${normalized}`);
        }
        if (entry.kind === "pdf") {
            throw new Error("Arquivos PDF não são editáveis como texto.");
        }
        return entry.content ?? "";
    }

    writeFile(path, content) {
        const normalized = normalizePath(path);
        const entry = this.workspace.entries[normalized];
        if (!entry || entry.type !== "file" || entry.kind === "pdf") {
            throw new Error(`Arquivo de texto não encontrado: ${normalized}`);
        }
        entry.content = content;
    }

    ensureParentDirs(path) {
        let current = parentPath(path);
        while (current) {
            if (!this.workspace.entries[current]) {
                this.workspace.entries[current] = { type: "dir" };
            } else if (this.workspace.entries[current].type !== "dir") {
                throw new Error(`Caminho inválido: ${current} não é pasta`);
            }
            current = parentPath(current);
        }
    }

    async getDirectoryHandleFor(path, { create = false } = {}) {
        if (!this.nativeRoot) {
            throw new Error("Nenhuma pasta raiz aberta.");
        }
        const normalized = normalizePath(path);
        if (!normalized) {
            return this.nativeRoot;
        }
        if (this.nativeHandles.has(normalized) && this.isDir(normalized)) {
            return this.nativeHandles.get(normalized);
        }
        const parts = normalized.split("/");
        let dir = this.nativeRoot;
        let built = "";
        for (const part of parts) {
            built = joinPath(built, part);
            dir = await dir.getDirectoryHandle(part, { create });
            this.nativeHandles.set(built, dir);
            if (!this.workspace.entries[built]) {
                this.workspace.entries[built] = { type: "dir" };
            }
        }
        return dir;
    }

    async writeNativeTextFile(path, content) {
        if (!this.isOpen()) {
            throw new Error("Abra uma pasta raiz antes de salvar.");
        }
        const normalized = normalizePath(path);
        const parts = normalized.split("/");
        const fileName = parts.pop();
        const dir = await this.getDirectoryHandleFor(parts.join("/"), { create: true });
        const handle = await dir.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        this.nativeHandles.set(normalized, handle);
        return true;
    }

    async writeNativeBinaryFile(path, data) {
        if (!this.isOpen()) {
            throw new Error("Abra uma pasta raiz antes de importar.");
        }
        const normalized = normalizePath(path);
        const parts = normalized.split("/");
        const fileName = parts.pop();
        const dir = await this.getDirectoryHandleFor(parts.join("/"), { create: true });
        const handle = await dir.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        this.nativeHandles.set(normalized, handle);
        this.revokePdfUrl(normalized);
        return true;
    }

    async createFile(path, content = "") {
        const normalized = normalizePath(path);
        if (!normalized) {
            throw new Error("Nome de arquivo inválido");
        }
        if (this.exists(normalized)) {
            throw new Error("Já existe um item com esse nome");
        }
        this.ensureParentDirs(normalized);
        const kind = fileKind(normalized);
        this.workspace.entries[normalized] = {
            type: "file",
            kind,
            content: kind === "pdf" ? null : content,
        };
        if (this.isOpen() && kind !== "pdf") {
            await this.writeNativeTextFile(normalized, content);
        }
        return normalized;
    }

    async createFolder(path) {
        const normalized = normalizePath(path);
        if (!normalized) {
            throw new Error("Nome de pasta inválido");
        }
        if (this.exists(normalized)) {
            throw new Error("Já existe um item com esse nome");
        }
        this.ensureParentDirs(normalized);
        this.workspace.entries[normalized] = { type: "dir" };
        this.workspace.expanded[normalized] = true;
        if (this.isOpen()) {
            await this.getDirectoryHandleFor(normalized, { create: true });
        }
        return normalized;
    }

    async deletePath(path) {
        const normalized = normalizePath(path);
        if (!this.exists(normalized)) {
            return;
        }

        if (this.isOpen()) {
            const parent = parentPath(normalized);
            const name = baseName(normalized);
            const dir = await this.getDirectoryHandleFor(parent, { create: false });
            await dir.removeEntry(name, { recursive: true });
        }

        const prefix = `${normalized}/`;
        for (const key of Object.keys(this.workspace.entries)) {
            if (key === normalized || key.startsWith(prefix)) {
                this.revokePdfUrl(key);
                delete this.workspace.entries[key];
                delete this.workspace.expanded[key];
                this.nativeHandles.delete(key);
            }
        }

        if (
            this.workspace.activePath === normalized ||
            this.workspace.activePath.startsWith(prefix)
        ) {
            const fallback = Object.keys(this.workspace.entries).find(
                (key) => this.workspace.entries[key].type === "file"
            );
            this.workspace.activePath = fallback || "";
        }
    }

    async renamePath(oldPath, newName) {
        const from = normalizePath(oldPath);
        if (!this.exists(from)) {
            throw new Error("Item não encontrado");
        }

        const cleanName = normalizePath(newName).split("/").pop();
        if (!cleanName || cleanName.includes("..")) {
            throw new Error("Nome inválido");
        }

        const entry = this.workspace.entries[from];
        let nextName = cleanName;
        if (entry.type === "file" && entry.kind !== "pdf") {
            nextName = ensureTexExtension(cleanName);
        }
        const to = joinPath(parentPath(from), nextName);
        if (from === to) {
            return from;
        }
        if (this.exists(to)) {
            throw new Error("Já existe um item com esse nome");
        }

        if (this.isOpen()) {
            await this.#nativeMove(from, to, entry.type === "dir");
        }

        const moves = Object.keys(this.workspace.entries)
            .filter((key) => key === from || key.startsWith(`${from}/`))
            .sort((a, b) => b.length - a.length);

        for (const key of moves) {
            const suffix = key.slice(from.length);
            const target = `${to}${suffix}`;
            this.workspace.entries[target] = this.workspace.entries[key];
            delete this.workspace.entries[key];
            if (this.workspace.expanded[key]) {
                this.workspace.expanded[target] = true;
                delete this.workspace.expanded[key];
            }
            if (this.nativeHandles.has(key)) {
                this.nativeHandles.set(target, this.nativeHandles.get(key));
                this.nativeHandles.delete(key);
            }
            if (this.pdfUrls.has(key)) {
                this.pdfUrls.set(target, this.pdfUrls.get(key));
                this.pdfUrls.delete(key);
            }
        }

        if (this.workspace.activePath === from || this.workspace.activePath.startsWith(`${from}/`)) {
            this.workspace.activePath =
                this.workspace.activePath === from
                    ? to
                    : `${to}${this.workspace.activePath.slice(from.length)}`;
        }

        return to;
    }

    async #nativeMove(from, to, isDirectory) {
        const fromParent = await this.getDirectoryHandleFor(parentPath(from));
        const toParent = await this.getDirectoryHandleFor(parentPath(to), { create: true });
        const fromName = baseName(from);
        const toName = baseName(to);

        if (isDirectory) {
            const sourceDir = await fromParent.getDirectoryHandle(fromName);
            const targetDir = await toParent.getDirectoryHandle(toName, { create: true });
            await this.#copyDirectory(sourceDir, targetDir);
            await fromParent.removeEntry(fromName, { recursive: true });
            return;
        }

        const sourceFile = await fromParent.getFileHandle(fromName);
        const file = await sourceFile.getFile();
        const targetFile = await toParent.getFileHandle(toName, { create: true });
        const writable = await targetFile.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        await fromParent.removeEntry(fromName);
        this.nativeHandles.set(to, targetFile);
        this.nativeHandles.delete(from);
    }

    async #copyDirectory(sourceDir, targetDir) {
        for await (const [name, handle] of sourceDir.entries()) {
            if (handle.kind === "directory") {
                const next = await targetDir.getDirectoryHandle(name, { create: true });
                await this.#copyDirectory(handle, next);
            } else {
                const file = await handle.getFile();
                const out = await targetDir.getFileHandle(name, { create: true });
                const writable = await out.createWritable();
                await writable.write(await file.arrayBuffer());
                await writable.close();
            }
        }
    }

    isExpanded(path) {
        return Boolean(this.workspace.expanded[normalizePath(path)]);
    }

    toggleExpanded(path) {
        const normalized = normalizePath(path);
        this.workspace.expanded[normalized] = !this.isExpanded(normalized);
        return this.workspace.expanded[normalized];
    }

    setExpanded(path, value) {
        this.workspace.expanded[normalizePath(path)] = Boolean(value);
    }

    listChildren(dirPath = "") {
        const parent = normalizePath(dirPath);
        return Object.keys(this.workspace.entries)
            .filter((path) => {
                if (parent) {
                    if (!path.startsWith(`${parent}/`)) {
                        return false;
                    }
                    const rest = path.slice(parent.length + 1);
                    return !rest.includes("/");
                }
                return !path.includes("/");
            })
            .map((path) => ({
                path,
                name: baseName(path),
                type: this.workspace.entries[path].type,
                kind: this.workspace.entries[path].kind || "tex",
            }))
            .sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "dir" ? -1 : 1;
                }
                return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
            });
    }

    buildTreeRows() {
        const rows = [];
        const walk = (dirPath, depth) => {
            for (const child of this.listChildren(dirPath)) {
                rows.push({ ...child, depth });
                if (child.type === "dir" && this.isExpanded(child.path)) {
                    walk(child.path, depth + 1);
                }
            }
        };
        walk("", 0);
        return rows;
    }

    relativeImportPath(fromFile, toFile) {
        const fromDir = parentPath(fromFile);
        const target = normalizePath(toFile).replace(/\.tex$/i, "");
        if (!fromDir) {
            return target;
        }
        const fromParts = fromDir.split("/");
        const toParts = target.split("/");
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
            i += 1;
        }
        const ups = fromParts.length - i;
        const down = toParts.slice(i).join("/");
        const prefix = ups > 0 ? `${"../".repeat(ups)}` : "";
        return `${prefix}${down}`.replace(/\/$/, "") || ".";
    }

    revokePdfUrl(path) {
        const url = this.pdfUrls.get(path);
        if (url) {
            URL.revokeObjectURL(url);
            this.pdfUrls.delete(path);
        }
    }

    async getPdfObjectUrl(path) {
        const normalized = normalizePath(path);
        if (!this.isPdf(normalized)) {
            throw new Error("Não é um PDF.");
        }
        if (this.pdfUrls.has(normalized)) {
            return this.pdfUrls.get(normalized);
        }
        const handle = this.nativeHandles.get(normalized);
        if (!handle) {
            throw new Error("Handle do PDF indisponível.");
        }
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        this.pdfUrls.set(normalized, url);
        return url;
    }

    async downloadFile(path) {
        const normalized = normalizePath(path);
        const handle = this.nativeHandles.get(normalized);
        if (!handle || handle.kind === "directory") {
            throw new Error("Arquivo indisponível para download.");
        }
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = baseName(normalized);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    findCompanionPdf(texPath) {
        const normalized = normalizePath(texPath);
        if (!normalized) {
            return "";
        }
        const candidate = normalized.replace(/\.tex$/i, ".pdf");
        return this.isPdf(candidate) ? candidate : "";
    }

    /**
     * Documento raiz a compilar (estilo Overleaf):
     * 1) main.tex  2) arquivo ativo com \\documentclass  3) qualquer .tex com \\documentclass
     */
    resolveMainDocument(preferredPath = "") {
        const preferred = normalizePath(preferredPath);
        if (this.isTextFile("main.tex")) {
            return "main.tex";
        }

        const hasDocumentClass = (path) => {
            try {
                return /\\documentclass\b/.test(this.readFile(path));
            } catch {
                return false;
            }
        };

        if (preferred && this.isTextFile(preferred) && hasDocumentClass(preferred)) {
            return preferred;
        }

        const active = this.getActivePath();
        if (active && this.isTextFile(active) && hasDocumentClass(active)) {
            return active;
        }

        const texFiles = Object.keys(this.workspace.entries)
            .filter((path) => this.isTextFile(path))
            .sort((a, b) => a.localeCompare(b, "pt-BR"));

        for (const path of texFiles) {
            if (hasDocumentClass(path)) {
                return path;
            }
        }

        return preferred && this.isTextFile(preferred) ? preferred : texFiles[0] || "";
    }

    async buildCompilePayload(mainPath, editorOverrides = {}) {
        if (!this.isOpen()) {
            throw new Error("Abra uma pasta raiz antes de compilar.");
        }
        const main = normalizePath(mainPath);
        if (!main || !this.isTextFile(main)) {
            throw new Error("Selecione um arquivo .tex principal para compilar.");
        }

        const files = [];
        for (const [path, entry] of Object.entries(this.workspace.entries)) {
            if (entry.type !== "file") {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(editorOverrides, path)) {
                files.push({
                    path,
                    content: editorOverrides[path],
                    encoding: "utf-8",
                });
                continue;
            }
            if (entry.kind === "pdf" || entry.kind === "asset") {
                const handle = this.nativeHandles.get(path);
                if (!handle) {
                    continue;
                }
                const file = await handle.getFile();
                const buffer = await file.arrayBuffer();
                files.push({
                    path,
                    content: arrayBufferToBase64(buffer),
                    encoding: "base64",
                });
                continue;
            }
            files.push({
                path,
                content: entry.content ?? "",
                encoding: "utf-8",
            });
        }

        if (!files.some((item) => item.path === main)) {
            throw new Error("Arquivo principal ausente no projeto.");
        }

        return { main, files };
    }

    async saveCompiledPdf(texPath, pdfBytes) {
        const target = normalizePath(texPath).replace(/\.tex$/i, ".pdf");
        await this.writeNativeBinaryFile(target, pdfBytes);
        this.workspace.entries[target] = { type: "file", kind: "pdf", content: null };
        this.revokePdfUrl(target);
        return target;
    }

    async mountRoot(root) {
        const entries = {};
        const handles = new Map();

        const walk = async (dirHandle, prefix) => {
            for await (const [name, handle] of dirHandle.entries()) {
                const path = joinPath(prefix, name);
                if (handle.kind === "directory") {
                    entries[path] = { type: "dir" };
                    handles.set(path, handle);
                    await walk(handle, path);
                } else if (SUPPORTED_EXT.test(name)) {
                    if (BINARY_EXT.test(name)) {
                        entries[path] = {
                            type: "file",
                            kind: fileKind(path),
                            content: null,
                        };
                        handles.set(path, handle);
                    } else if (TEXT_EXT.test(name)) {
                        const file = await handle.getFile();
                        const content = await file.text();
                        entries[path] = { type: "file", kind: fileKind(path), content };
                        handles.set(path, handle);
                    }
                }
            }
        };

        await walk(root, "");

        this.pdfUrls.forEach((url) => URL.revokeObjectURL(url));
        this.pdfUrls.clear();

        this.nativeRoot = root;
        this.nativeHandles = handles;
        this.mode = "native";

        const files = Object.keys(entries).filter((path) => entries[path].type === "file");
        const preferred =
            files.find((f) => /(^|\/)main\.tex$/i.test(f)) ||
            files.find((f) => f.endsWith(".tex")) ||
            files[0] ||
            "";

        this.workspace = {
            name: root.name,
            activePath: preferred,
            expanded: { "": true },
            entries,
        };

        for (const path of Object.keys(entries)) {
            if (entries[path].type === "dir") {
                this.workspace.expanded[path] = true;
            }
        }

        await saveRootHandle(root);
        return this.workspace;
    }

    async openNativeFolder() {
        if (!this.supportsNativeFolder()) {
            throw new Error(this.nativeFolderBlockReason() || "Abertura de pasta indisponível.");
        }
        const root = await window.showDirectoryPicker({ mode: "readwrite" });
        return this.mountRoot(root);
    }

    async tryRestoreFolder() {
        if (!this.supportsNativeFolder()) {
            return false;
        }
        try {
            const handle = await loadRootHandle();
            if (!handle) {
                return false;
            }
            const permission = await handle.queryPermission({ mode: "readwrite" });
            let state = permission;
            if (state !== "granted") {
                state = await handle.requestPermission({ mode: "readwrite" });
            }
            if (state !== "granted") {
                return false;
            }
            await this.mountRoot(handle);
            return true;
        } catch (error) {
            console.error("Falha ao restaurar pasta:", error);
            await clearRootHandle().catch(() => {});
            return false;
        }
    }

    closeFolder() {
        this.pdfUrls.forEach((url) => URL.revokeObjectURL(url));
        this.pdfUrls.clear();
        this.nativeRoot = null;
        this.nativeHandles = new Map();
        this.mode = "idle";
        this.workspace = emptyWorkspace();
        clearRootHandle().catch(() => {});
    }

    /** @deprecated virtual mode removed from primary flow */
    load() {
        this.workspace = emptyWorkspace();
        this.mode = "idle";
        try {
            localStorage.removeItem(WORKSPACE_KEY);
        } catch {
            // ignore
        }
        return this.workspace;
    }
}

export {
    normalizePath,
    parentPath,
    baseName,
    joinPath,
    ensureTexExtension,
    fileKind,
};
