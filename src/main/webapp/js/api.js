function getContextPath() {
    const path = window.location.pathname || "/";
    // /index.html → ""
    // /LaTEdit/ ou /LaTEdit/index.html → /LaTEdit
    if (path === "/" || path === "") {
        return "";
    }
    if (path.endsWith(".html")) {
        const dir = path.slice(0, path.lastIndexOf("/"));
        return dir === "/" ? "" : dir;
    }
    return path.replace(/\/$/, "");
}

const DEFAULT_API_PORT = "8081";

function defaultDevApiBase() {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
}

/**
 * Base da API:
 * - Docker / Jetty / Tomcat (mesma origem): origin + context path
 * - Front estático na porta 5500: Jetty em :8081
 * - Override: localStorage.latexedit.apiBase
 */
export function getApiBase() {
    try {
        const stored = localStorage.getItem("latexedit.apiBase");
        if (stored) {
            return stored.replace(/\/$/, "");
        }
    } catch {
        // ignore
    }

    const port = window.location.port;
    // Servidor estático de desenvolvimento
    if (port === "5500") {
        return defaultDevApiBase();
    }

    // Mesma origem (Jetty :, Tomcat WAR, Docker NAS)
    return `${window.location.origin}${getContextPath()}`;
}

export async function checkHealth(apiBase = getApiBase()) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch(`${apiBase}/api/health`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Health HTTP ${response.status}`);
        }
        return response.json();
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`Timeout ao conectar em ${apiBase}`);
        }
        throw error;
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * @param {{ main: string, files: Array<{ path: string, content: string, encoding?: string }> }} payload
 */
export async function compileProject(payload, apiBase = getApiBase(), timeoutMs = 150000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${apiBase}/api/compile`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const data = await response.json().catch(() => null);
        if (!data) {
            throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`);
        }
        return { httpStatus: response.status, ...data };
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(
                `Timeout na compilação (${Math.round(timeoutMs / 1000)}s). Verifique pacotes TeX / logs do container.`
            );
        }
        throw error;
    } finally {
        window.clearTimeout(timer);
    }
}

export function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
