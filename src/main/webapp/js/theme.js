const THEME_KEY = "latexedit.theme";

export function getStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === "dark" || stored === "light") {
            return stored;
        }
    } catch (error) {
        console.error("Falha ao ler tema:", error);
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch (error) {
        console.error("Falha ao salvar tema:", error);
    }
    return next;
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || getStoredTheme();
    return applyTheme(current === "dark" ? "light" : "dark");
}

export function syncThemeToggle(button) {
    if (!button) {
        return;
    }
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const isDark = theme === "dark";
    button.setAttribute("aria-pressed", String(isDark));
    button.title = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";
    button.setAttribute(
        "aria-label",
        isDark ? "Mudar para tema claro" : "Mudar para tema escuro"
    );
}
