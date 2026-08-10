const SETTINGS_KEY = "latexedit.settings";

const DEFAULTS = {
    wordWrap: true,
};

export function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            return { ...DEFAULTS };
        }
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULTS,
            ...(parsed && typeof parsed === "object" ? parsed : {}),
        };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
        // ignore quota / private mode
    }
    return next;
}

export function applyEditorWordWrap(editor, enabled) {
    if (!editor) {
        return;
    }
    const on = Boolean(enabled);
    editor.setAttribute("wrap", on ? "soft" : "off");
    editor.classList.toggle("is-word-wrap", on);
}

export function createSettingsPage({
    modalEl,
    openBtn,
    wordWrapInput,
    onChange,
}) {
    function syncForm(settings) {
        if (wordWrapInput) {
            wordWrapInput.checked = Boolean(settings.wordWrap);
        }
    }

    function open() {
        syncForm(loadSettings());
        modalEl.hidden = false;
        openBtn?.setAttribute("aria-pressed", "true");
        wordWrapInput?.focus();
    }

    function close() {
        modalEl.hidden = true;
        openBtn?.setAttribute("aria-pressed", "false");
    }

    function isOpen() {
        return !modalEl.hidden;
    }

    openBtn?.addEventListener("click", () => open());

    modalEl?.querySelectorAll("[data-close-settings]").forEach((el) => {
        el.addEventListener("click", () => close());
    });

    wordWrapInput?.addEventListener("change", () => {
        const settings = saveSettings({ wordWrap: wordWrapInput.checked });
        onChange?.(settings);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isOpen()) {
            close();
        }
    });

    return {
        open,
        close,
        isOpen,
        syncForm,
        load: loadSettings,
    };
}
