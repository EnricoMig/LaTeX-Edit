import { ACCENT_PRESETS, applyAppearance } from "./theme.js";

const SETTINGS_KEY = "latexedit.settings";

const DEFAULTS = {
    wordWrap: true,
    themeMode: "system",
    accentPreset: "teal",
    accentCustom: "#0d6e6e",
    templates: {},
};

export function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            return structuredClone(DEFAULTS);
        }
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULTS,
            ...(parsed && typeof parsed === "object" ? parsed : {}),
            templates:
                parsed?.templates && typeof parsed.templates === "object" ? parsed.templates : {},
        };
    } catch {
        return structuredClone(DEFAULTS);
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

export function applySettingsToAppearance(settings) {
    applyAppearance({
        themeMode: settings.themeMode,
        accentPreset: settings.accentPreset,
        accentCustom: settings.accentCustom,
    });
}

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function renderTemplateList(container, templates, onTemplatesChange) {
    if (!container) {
        return;
    }
    const entries = Object.entries(templates);
    if (entries.length === 0) {
        container.innerHTML = `<p class="settings-empty">Nenhum template. Crie um para usar <code>a!{nome}</code> no editor.</p>`;
        return;
    }
    container.innerHTML = entries
        .map(
            ([name, content]) => `
        <article class="template-card" data-template-name="${escapeHtml(name)}">
            <div class="template-card-head">
                <strong>${escapeHtml(name)}</strong>
                <div class="template-card-actions">
                    <button type="button" class="btn btn-tiny" data-template-edit="${escapeHtml(name)}">Editar</button>
                    <button type="button" class="btn btn-tiny btn-danger-soft" data-template-delete="${escapeHtml(name)}">Excluir</button>
                </div>
            </div>
            <pre class="template-preview">${escapeHtml(String(content).slice(0, 180))}${String(content).length > 180 ? "…" : ""}</pre>
        </article>
    `
        )
        .join("");

    container.querySelectorAll("[data-template-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const name = btn.getAttribute("data-template-edit");
            const current = templates[name] ?? "";
            const nextName = window.prompt("Nome do template:", name);
            if (!nextName?.trim()) {
                return;
            }
            const nextContent = window.prompt("Conteúdo LaTeX do template:", current);
            if (nextContent === null) {
                return;
            }
            const nextTemplates = { ...templates };
            if (nextName.trim() !== name) {
                delete nextTemplates[name];
            }
            nextTemplates[nextName.trim()] = nextContent;
            onTemplatesChange(nextTemplates);
        });
    });

    container.querySelectorAll("[data-template-delete]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const name = btn.getAttribute("data-template-delete");
            if (!window.confirm(`Excluir o template "${name}"?`)) {
                return;
            }
            const nextTemplates = { ...templates };
            delete nextTemplates[name];
            onTemplatesChange(nextTemplates);
        });
    });
}

export function createSettingsPage({
    modalEl,
    openBtn,
    wordWrapInput,
    themeModeSelect,
    accentPresetContainer,
    accentCustomInput,
    templateListEl,
    btnAddTemplate,
    onChange,
}) {
    function onTemplatesChange(nextTemplates) {
        const next = saveSettings({ templates: nextTemplates });
        renderTemplateList(templateListEl, next.templates, onTemplatesChange);
        onChange?.(next);
    }

    function syncForm(settings) {
        if (wordWrapInput) {
            wordWrapInput.checked = Boolean(settings.wordWrap);
        }
        if (themeModeSelect) {
            themeModeSelect.value = settings.themeMode || "system";
        }
        if (accentCustomInput) {
            accentCustomInput.value = settings.accentCustom || "#0d6e6e";
            accentCustomInput.hidden = settings.accentPreset !== "custom";
        }
        accentPresetContainer?.querySelectorAll("[data-accent-preset]").forEach((btn) => {
            const preset = btn.getAttribute("data-accent-preset");
            btn.classList.toggle("is-active", preset === (settings.accentPreset || "teal"));
            if (preset !== "custom" && ACCENT_PRESETS[preset]) {
                btn.style.setProperty("--swatch", ACCENT_PRESETS[preset].light);
            }
        });
        renderTemplateList(templateListEl, settings.templates || {}, onTemplatesChange);
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
        onChange?.(saveSettings({ wordWrap: wordWrapInput.checked }));
    });

    themeModeSelect?.addEventListener("change", () => {
        onChange?.(saveSettings({ themeMode: themeModeSelect.value }));
    });

    accentPresetContainer?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-accent-preset]");
        if (!btn) {
            return;
        }
        const preset = btn.getAttribute("data-accent-preset");
        const partial = { accentPreset: preset };
        if (preset === "custom" && accentCustomInput) {
            partial.accentCustom = accentCustomInput.value;
            accentCustomInput.hidden = false;
            accentCustomInput.focus();
        } else if (accentCustomInput) {
            accentCustomInput.hidden = true;
        }
        onChange?.(saveSettings(partial));
        syncForm(loadSettings());
    });

    accentCustomInput?.addEventListener("change", () => {
        onChange?.(
            saveSettings({
                accentPreset: "custom",
                accentCustom: accentCustomInput.value,
            })
        );
        syncForm(loadSettings());
    });

    btnAddTemplate?.addEventListener("click", () => {
        const name = window.prompt("Nome do template (usado em a!{nome}):");
        if (!name?.trim()) {
            return;
        }
        const content = window.prompt("Conteúdo LaTeX:", "");
        if (content === null) {
            return;
        }
        const settings = loadSettings();
        const nextTemplates = { ...settings.templates, [name.trim()]: content };
        onChange?.(saveSettings({ templates: nextTemplates }));
        syncForm(loadSettings());
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
