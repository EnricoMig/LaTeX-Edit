import { getApiBase } from "./api.js";

const PROJECT_KEY = "latexedit.serverProject";
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(tex|bib|sty|cls|txt|md)$/i;
const BINARY_EXT = /\.(pdf|png|jpg|jpeg|eps|svg|gif)$/i;

export function normalizePath(path) {
    if (!path) {
        return "";
    }
    return String(path).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function baseName(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function parentPath(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(0, idx) : "";
}

export function ensureTexExtension(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return "novo.tex";
    }
    return /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : `${trimmed}.tex`;
}

function kindOf(name) {
    const lower = name.toLowerCase();
    if (PDF_EXT.test(lower)) {
        return "pdf";
    }
    if (BINARY_EXT.test(lower)) {
        return "asset";
    }
    if (lower.endsWith(".bib")) {
        return "bib";
    }
    if (lower.endsWith(".sty") || lower.endsWith(".cls")) {
        return "sty";
    }
    return "text";
}

async function apiJson(method, path, body) {
    const response = await fetch(`${getApiBase()}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
        throw new Error(data?.message || `Falha FS HTTP ${response.status}`);
    }
    return data;
}

export class WorkspaceFs {
    constructor() {
        this.projectRoot = "";
        this.workspace = {
            name: "",
            activePath: "",
            entries: {},
            expanded: new Set([""]),
        };
        this.contentCache = new Map();
        this.pdfUrls = new Map();
    }

    load() {
        try {
            const saved = localStorage.getItem(PROJECT_KEY);
            if (saved) {
                this.projectRoot = normalizePath(saved);
            }
        } catch {
            // ignore
        }
    }

    persistProject() {
        try {
            if (this.projectRoot) {
                localStorage.setItem(PROJECT_KEY, this.projectRoot);
            } else {
                localStorage.removeItem(PROJECT_KEY);
            }
        } catch {
            // ignore
        }
    }

    supportsNativeFolder() {
        return true;
    }

    nativeFolderBlockReason() {
        return null;
    }

    isOpen() {
        return Boolean(this.projectRoot);
    }

    getName() {
        return this.workspace.name || baseName(this.projectRoot) || this.projectRoot || "";
    }

    getProjectRoot() {
        return this.projectRoot;
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

    isFile(path) {
        return this.workspace.entries[normalizePath(path)]?.type === "file";
    }

    isDir(path) {
        const key = normalizePath(path);
        if (!key) {
            return this.isOpen();
        }
        return this.workspace.entries[key]?.type === "dir";
    }

    isPdf(path) {
        return this.workspace.entries[normalizePath(path)]?.kind === "pdf";
    }

    isTextFile(path) {
        const entry = this.workspace.entries[normalizePath(path)];
        return entry?.type === "file" && entry.kind !== "pdf" && entry.kind !== "asset";
    }

    isExpanded(path) {
        return this.workspace.expanded.has(normalizePath(path));
    }

    setExpanded(path, value) {
        const key = normalizePath(path);
        if (value) {
            this.workspace.expanded.add(key);
        } else {
            this.workspace.expanded.delete(key);
        }
    }

    toggleExpanded(path) {
        const key = normalizePath(path);
        if (this.workspace.expanded.has(key)) {
            this.workspace.expanded.delete(key);
        } else {
            this.workspace.expanded.add(key);
        }
    }

    fullPath(projectRelative) {
        const rel = normalizePath(projectRelative);
        if (!this.projectRoot) {
            return rel;
        }
        return rel ? `${this.projectRoot}/${rel}` : this.projectRoot;
    }

    async listServerDir(relative = "") {
        const data = await apiJson("GET", `/api/fs/list?path=${encodeURIComponent(normalizePath(relative))}`);
        return data.items || [];
    }

    async getWorkspaceInfo() {
        return apiJson("GET", "/api/fs/info");
    }

    /**
     * Cria pasta relativa à raiz do workspace (não à pasta de projeto aberta).
     */
    async mkdirAtWorkspace(relative) {
        const path = normalizePath(relative);
        if (!path) {
            throw new Error("Informe um nome de pasta.");
        }
        await apiJson("POST", "/api/fs/mkdir", { path });
        return path;
    }

    /**
     * Cria arquivo relativo à raiz do workspace (não à pasta de projeto aberta).
     */
    async createFileAtWorkspace(relative, content = "") {
        const path = normalizePath(relative);
        if (!path) {
            throw new Error("Informe um caminho de arquivo.");
        }
        await apiJson("POST", "/api/fs/create", { path, content: content ?? "" });
        return path;
    }

    async openServerFolder(projectRelative) {
        const root = normalizePath(projectRelative);
        const data = await apiJson("GET", `/api/fs/tree?path=${encodeURIComponent(root)}`);
        this.projectRoot = root;
        this.workspace.name = baseName(root) || root || "workspace";
        this.workspace.entries = {};
        this.contentCache.clear();
        this.revokeAllPdfUrls();

        for (const item of data.items || []) {
            const abs = normalizePath(item.path);
            const rel = root && abs.startsWith(`${root}/`)
                ? abs.slice(root.length + 1)
                : abs === root
                  ? ""
                  : abs;
            if (!rel) {
                continue;
            }
            this.workspace.entries[rel] = {
                type: item.type,
                kind: item.kind || (item.type === "dir" ? "dir" : kindOf(item.name)),
                content: null,
            };
        }

        this.workspace.expanded = new Set([""]);
        const preferred =
            Object.keys(this.workspace.entries).find((p) => p.toLowerCase() === "main.tex") ||
            Object.keys(this.workspace.entries).find((p) => TEXT_EXT.test(p)) ||
            "";
        this.workspace.activePath = preferred;
        this.persistProject();
        return this.workspace;
    }

    async tryRestoreFolder() {
        if (!this.projectRoot) {
            return false;
        }
        try {
            await this.openServerFolder(this.projectRoot);
            return true;
        } catch (error) {
            console.warn("Falha ao restaurar projeto do servidor:", error);
            this.projectRoot = "";
            this.persistProject();
            return false;
        }
    }

    async openNativeFolder() {
        // Mantido por compatibilidade: o app abre o seletor de pastas do NAS.
        throw new Error("Use o seletor de pastas do servidor.");
    }

    buildTreeRows() {
        const rows = [];
        const entries = Object.entries(this.workspace.entries)
            .map(([path, meta]) => ({ path, ...meta, name: baseName(path) }))
            .sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "dir" ? -1 : 1;
                }
                return a.path.localeCompare(b.path, "pt-BR", { sensitivity: "base" });
            });

        const visible = (path) => {
            let parent = parentPath(path);
            while (parent) {
                if (!this.isExpanded(parent)) {
                    return false;
                }
                parent = parentPath(parent);
            }
            return true;
        };

        for (const entry of entries) {
            if (!visible(entry.path)) {
                continue;
            }
            const depth = entry.path.split("/").length - 1;
            rows.push({
                path: entry.path,
                name: entry.name,
                type: entry.type,
                kind: entry.kind,
                depth,
            });
        }
        return rows;
    }

    async readFile(path) {
        const key = normalizePath(path);
        if (this.contentCache.has(key)) {
            return this.contentCache.get(key);
        }
        const data = await apiJson("GET", `/api/fs/read?path=${encodeURIComponent(this.fullPath(key))}`);
        this.contentCache.set(key, data.content ?? "");
        return this.contentCache.get(key);
    }

    writeFile(path, content) {
        const key = normalizePath(path);
        this.contentCache.set(key, content);
        if (!this.workspace.entries[key]) {
            this.workspace.entries[key] = { type: "file", kind: kindOf(key), content: null };
        }
    }

    async writeNativeTextFile(path, content) {
        const key = normalizePath(path);
        await apiJson("PUT", "/api/fs/write", {
            path: this.fullPath(key),
            content: content ?? "",
        });
        this.contentCache.set(key, content ?? "");
    }

    async createFile(path, content = "") {
        const key = normalizePath(path);
        await apiJson("POST", "/api/fs/create", {
            path: this.fullPath(key),
            content,
        });
        this.workspace.entries[key] = { type: "file", kind: kindOf(key), content: null };
        this.contentCache.set(key, content);
        return key;
    }

    async createFolder(path) {
        const key = normalizePath(path);
        await apiJson("POST", "/api/fs/mkdir", { path: this.fullPath(key) });
        this.workspace.entries[key] = { type: "dir", kind: "dir", content: null };
        return key;
    }

    async deletePath(path) {
        const key = normalizePath(path);
        await apiJson("DELETE", `/api/fs/delete?path=${encodeURIComponent(this.fullPath(key))}`);
        const prefix = `${key}/`;
        for (const entryPath of Object.keys(this.workspace.entries)) {
            if (entryPath === key || entryPath.startsWith(prefix)) {
                delete this.workspace.entries[entryPath];
                this.contentCache.delete(entryPath);
                this.revokePdfUrl(entryPath);
            }
        }
        if (this.workspace.activePath === key || this.workspace.activePath.startsWith(prefix)) {
            this.workspace.activePath =
                Object.keys(this.workspace.entries).find((p) => this.isTextFile(p)) || "";
        }
    }

    async relocate(fromPath, destPath) {
        const key = normalizePath(fromPath);
        const dest = normalizePath(destPath);
        if (!key || !dest) {
            throw new Error("Caminho inválido.");
        }
        if (dest === key) {
            return key;
        }
        if (this.workspace.entries[dest]) {
            throw new Error(`Já existe um item em "${dest}".`);
        }
        if (this.isDir(key) && (dest === key || dest.startsWith(`${key}/`))) {
            throw new Error("Não é possível mover uma pasta para dentro dela mesma.");
        }

        await apiJson("POST", "/api/fs/rename", {
            from: this.fullPath(key),
            to: this.fullPath(dest),
        });

        const prefix = `${key}/`;
        const updates = {};
        for (const [entryPath, meta] of Object.entries(this.workspace.entries)) {
            if (entryPath === key) {
                updates[dest] = { ...meta, kind: kindOf(dest) };
            } else if (entryPath.startsWith(prefix)) {
                const suffix = entryPath.slice(prefix.length);
                updates[`${dest}/${suffix}`] = meta;
            }
        }
        for (const entryPath of Object.keys(this.workspace.entries)) {
            if (entryPath === key || entryPath.startsWith(prefix)) {
                delete this.workspace.entries[entryPath];
            }
        }
        Object.assign(this.workspace.entries, updates);

        if (this.contentCache.has(key)) {
            this.contentCache.set(dest, this.contentCache.get(key));
            this.contentCache.delete(key);
        }
        if (this.pdfUrls.has(key)) {
            this.pdfUrls.set(dest, this.pdfUrls.get(key));
            this.pdfUrls.delete(key);
        }
        if (this.workspace.activePath === key) {
            this.workspace.activePath = dest;
        } else if (this.workspace.activePath.startsWith(prefix)) {
            this.workspace.activePath = dest + this.workspace.activePath.slice(key.length);
        }
        return dest;
    }

    async renamePath(path, nextName) {
        const key = normalizePath(path);
        const parent = parentPath(key);
        let targetName = nextName.trim();
        if (this.isPdf(key) && !PDF_EXT.test(targetName)) {
            targetName = `${targetName.replace(/\.pdf$/i, "")}.pdf`;
        } else if (this.isTextFile(key) && !PDF_EXT.test(targetName)) {
            targetName = ensureTexExtension(targetName);
        }
        const dest = parent ? `${parent}/${targetName}` : targetName;
        return this.relocate(key, dest);
    }

    /**
     * Move um arquivo .tex para outra pasta do projeto ("" = raiz).
     */
    async movePath(path, destDir) {
        const key = normalizePath(path);
        if (!this.isFile(key)) {
            throw new Error("Somente arquivos podem ser movidos por arrastar.");
        }
        if (!/\.tex$/i.test(key)) {
            throw new Error("Somente arquivos .tex podem ser movidos por arrastar.");
        }
        const destParent = normalizePath(destDir);
        if (destParent && !this.isDir(destParent)) {
            throw new Error("Pasta de destino inválida.");
        }
        if (parentPath(key) === destParent) {
            return key;
        }
        const dest = destParent ? `${destParent}/${baseName(key)}` : baseName(key);
        return this.relocate(key, dest);
    }


    resolveMainDocument(preferredPath) {
        const preferred = normalizePath(preferredPath);
        if (preferred && this.isTextFile(preferred)) {
            const cached = this.contentCache.get(preferred);
            if (cached && /\\documentclass\b/.test(cached)) {
                return preferred;
            }
            if (preferred.toLowerCase() === "main.tex") {
                return preferred;
            }
        }
        const main = Object.keys(this.workspace.entries).find((p) => p.toLowerCase() === "main.tex");
        if (main) {
            return main;
        }
        return (
            Object.keys(this.workspace.entries).find(
                (p) => this.isTextFile(p) && this.contentCache.has(p) && /\\documentclass\b/.test(this.contentCache.get(p))
            ) ||
            Object.keys(this.workspace.entries).find((p) => this.isTextFile(p) && p.toLowerCase().endsWith(".tex")) ||
            ""
        );
    }

    findCompanionPdf(texPath) {
        const candidate = normalizePath(texPath).replace(/\.tex$/i, ".pdf");
        return this.exists(candidate) && this.isPdf(candidate) ? candidate : "";
    }

    relativeImportPath(fromFile, targetFile) {
        return normalizePath(targetFile).replace(/\.tex$/i, "");
    }

    async buildCompilePayload(mainPath, overrides = {}) {
        return {
            project: this.projectRoot,
            main: normalizePath(mainPath),
            overrides,
        };
    }

    async saveCompiledPdf(texPath, _pdfBytes, serverPdfPath) {
        const target = normalizePath(texPath).replace(/\.tex$/i, ".pdf");
        this.workspace.entries[target] = { type: "file", kind: "pdf", content: null };
        this.revokePdfUrl(target);
        if (serverPdfPath) {
            // caminho absoluto no workspace — ok se bater com fullPath
        }
        return target;
    }

    pdfFileUrl(path) {
        return `${getApiBase()}/api/fs/file?path=${encodeURIComponent(this.fullPath(path))}&t=${Date.now()}`;
    }

    async getPdfObjectUrl(path) {
        const key = normalizePath(path);
        const response = await fetch(this.pdfFileUrl(key), { headers: { Accept: "application/pdf" } });
        if (!response.ok) {
            throw new Error(`Não foi possível carregar o PDF (HTTP ${response.status}).`);
        }
        const blob = await response.blob();
        this.revokePdfUrl(key);
        const url = URL.createObjectURL(blob);
        this.pdfUrls.set(key, url);
        return url;
    }

    revokePdfUrl(path) {
        const key = normalizePath(path);
        const url = this.pdfUrls.get(key);
        if (url) {
            URL.revokeObjectURL(url);
            this.pdfUrls.delete(key);
        }
    }

    revokeAllPdfUrls() {
        this.pdfUrls.forEach((url) => URL.revokeObjectURL(url));
        this.pdfUrls.clear();
    }

    async refreshTree() {
        if (!this.projectRoot) {
            return;
        }
        const active = this.workspace.activePath;
        await this.openServerFolder(this.projectRoot);
        if (active && this.exists(active)) {
            this.workspace.activePath = active;
        }
    }
}

export {
    PDF_EXT,
    TEXT_EXT,
};
