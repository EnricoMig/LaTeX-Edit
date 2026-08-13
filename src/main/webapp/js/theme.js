const THEME_KEY = "latexedit.theme";

export const ACCENT_PRESETS = {
    teal: { light: "#0d6e6e", hover: "#0a5858", soft: "#e4f2f2", dark: "#3db8b8", darkHover: "#5ec8c8", darkSoft: "#1a3336" },
    blue: { light: "#2563eb", hover: "#1d4ed8", soft: "#dbeafe", dark: "#60a5fa", darkHover: "#93c5fd", darkSoft: "#1e3a5f" },
    violet: { light: "#7c3aed", hover: "#6d28d9", soft: "#ede9fe", dark: "#a78bfa", darkHover: "#c4b5fd", darkSoft: "#2e1065" },
    green: { light: "#059669", hover: "#047857", soft: "#d1fae5", dark: "#34d399", darkHover: "#6ee7b7", darkSoft: "#064e3b" },
    orange: { light: "#ea580c", hover: "#c2410c", soft: "#ffedd5", dark: "#fb923c", darkHover: "#fdba74", darkSoft: "#431407" },
    rose: { light: "#e11d48", hover: "#be123c", soft: "#ffe4e6", dark: "#fb7185", darkHover: "#fda4af", darkSoft: "#4c0519" },
};

let systemThemeListener = null;

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

export function resolveThemeMode(themeMode) {
    if (themeMode === "dark" || themeMode === "light") {
        return themeMode;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAccent(presetKey, customColor, resolvedTheme) {
    const root = document.documentElement;
    if (presetKey === "custom" && customColor) {
        root.style.setProperty("--accent", customColor);
        root.style.setProperty("--accent-hover", customColor);
        root.style.setProperty("--accent-soft", `color-mix(in srgb, ${customColor} 18%, transparent)`);
        root.dataset.accent = "custom";
        return;
    }
    const preset = ACCENT_PRESETS[presetKey] || ACCENT_PRESETS.teal;
    const isDark = resolvedTheme === "dark";
    root.style.setProperty("--accent", isDark ? preset.dark : preset.light);
    root.style.setProperty("--accent-hover", isDark ? preset.darkHover : preset.hover);
    root.style.setProperty("--accent-soft", isDark ? preset.darkSoft : preset.soft);
    root.dataset.accent = presetKey in ACCENT_PRESETS ? presetKey : "teal";
}

function bindSystemThemeListener(themeMode, onSystemChange) {
    if (systemThemeListener) {
        systemThemeListener.removeEventListener("change", systemThemeListener.handler);
        systemThemeListener = null;
    }
    if (themeMode !== "system") {
        return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => onSystemChange?.();
    media.addEventListener("change", handler);
    systemThemeListener = { removeEventListener: media.removeEventListener.bind(media), handler };
}

export function applyAppearance({ themeMode = "system", accentPreset = "teal", accentCustom = "" } = {}) {
    const resolved = resolveThemeMode(themeMode);
    document.documentElement.setAttribute("data-theme", resolved);
    applyAccent(accentPreset, accentCustom, resolved);

    bindSystemThemeListener(themeMode, () => {
        applyAppearance({ themeMode, accentPreset, accentCustom });
        syncThemeToggle(document.getElementById("btn-theme"));
    });

    try {
        if (themeMode === "light" || themeMode === "dark") {
            localStorage.setItem(THEME_KEY, themeMode);
        }
    } catch (error) {
        console.error("Falha ao salvar tema:", error);
    }
    return resolved;
}

export function applyTheme(theme) {
    return applyAppearance({ themeMode: theme === "dark" ? "dark" : "light" });
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
