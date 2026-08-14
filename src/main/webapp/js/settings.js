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

function uniqueTemplateName(templates, base) {
    if (!templates[base]) {
        return base;
    }
    let n = 2;
    while (templates[`${base} (${n})`]) {
        n += 1;
    }
    return `${base} (${n})`;
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
    templateEditorEl,
    templateNameInput,
    templateBodyInput,
    onChange,
}) {
    let activeTab = "geral";
    let editingName = null;
    let menuEl = null;

    function hideMenu() {
        menuEl?.remove();
        menuEl = null;
    }

    function closeEditor() {
        editingName = null;
        if (templateEditorEl) {
            templateEditorEl.hidden = true;
        }
    }

    function openEditor(name = "", content = "", originalName = null) {
        editingName = originalName;
        if (templateNameInput) {
            templateNameInput.value = name;
        }
        if (templateBodyInput) {
            templateBodyInput.value = content;
        }
        if (templateEditorEl) {
            templateEditorEl.hidden = false;
            templateNameInput?.focus();
            templateNameInput?.select();
        }
    }

    function saveEditor() {
        const name = templateNameInput?.value.trim() || "";
        const content = templateBodyInput?.value ?? "";
        if (!name) {
            window.alert("Informe o nome do template.");
            templateNameInput?.focus();
            return;
        }
        const templates = { ...loadSettings().templates };
        if (editingName && editingName !== name) {
            delete templates[editingName];
        }
        templates[name] = content;
        onTemplatesChange(templates);
        closeEditor();
    }

    function onTemplatesChange(nextTemplates) {
        const next = saveSettings({ templates: nextTemplates });
        renderTemplateList(next.templates);
        onChange?.(next);
    }

    function showCardMenu(anchor, name) {
        hideMenu();
        menuEl = document.createElement("div");
        menuEl.className = "template-menu";
        menuEl.setAttribute("role", "menu");
        menuEl.innerHTML = `
            <button type="button" class="template-menu-item" data-action="edit">Editar</button>
            <button type="button" class="template-menu-item" data-action="duplicate">Duplicar</button>
            <button type="button" class="template-menu-item is-danger" data-action="delete">Excluir</button>
        `;
        document.body.appendChild(menuEl);
        const rect = anchor.getBoundingClientRect();
        const width = menuEl.offsetWidth || 140;
        const left = Math.min(rect.right - width, window.innerWidth - width - 8);
        const top = Math.min(rect.bottom + 4, window.innerHeight - menuEl.offsetHeight - 8);
        menuEl.style.left = `${Math.max(8, left)}px`;
        menuEl.style.top = `${Math.max(8, top)}px`;

        menuEl.addEventListener("click", (event) => {
            const action = event.target.closest("[data-action]")?.dataset.action;
            hideMenu();
            if (!action) {
                return;
            }
            const templates = { ...loadSettings().templates };
            if (action === "edit") {
                openEditor(name, templates[name] ?? "", name);
                return;
            }
            if (action === "duplicate") {
                const copyName = uniqueTemplateName(templates, `${name} (cópia)`);
                templates[copyName] = templates[name] ?? "";
                onTemplatesChange(templates);
                return;
            }
            if (action === "delete" && window.confirm(`Excluir o template "${name}"?`)) {
                delete templates[name];
                onTemplatesChange(templates);
            }
        });
    }

    function renderTemplateList(templates) {
        if (!templateListEl) {
            return;
        }
        const entries = Object.entries(templates || {});
        if (entries.length === 0) {
            templateListEl.innerHTML = `
                <p class="settings-empty">Nenhum template. Use o botão + para criar e insira com <code>\\template{nome}</code>.</p>
            `;
            return;
        }
        templateListEl.innerHTML = entries
            .map(
                ([name, content]) => `
            <article class="template-card" data-template-name="${escapeHtml(name)}">
                <div class="template-card-head">
                    <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
                    <button
                        type="button"
                        class="icon-btn template-kebab"
                        data-template-menu="${escapeHtml(name)}"
                        title="Mais opções"
                        aria-label="Mais opções de ${escapeHtml(name)}"
                    >
                        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
                    </button>
                </div>
                <pre class="template-preview">${escapeHtml(String(content).slice(0, 140))}${String(content).length > 140 ? "…" : ""}</pre>
                <code class="template-shortcut">\\template{${escapeHtml(name)}}</code>
            </article>
        `
            )
            .join("");

        templateListEl.querySelectorAll("[data-template-menu]").forEach((btn) => {
            btn.addEventListener("click", (event) => {
                event.stopPropagation();
                showCardMenu(btn, btn.getAttribute("data-template-menu"));
            });
        });
    }

    function setTab(tab) {
        activeTab = tab === "templates" ? "templates" : "geral";
        modalEl?.querySelectorAll("[data-settings-tab]").forEach((btn) => {
            const selected = btn.getAttribute("data-settings-tab") === activeTab;
            btn.classList.toggle("is-active", selected);
            btn.setAttribute("aria-selected", String(selected));
        });
        modalEl?.querySelectorAll("[data-settings-panel]").forEach((panel) => {
            panel.hidden = panel.getAttribute("data-settings-panel") !== activeTab;
        });
        if (activeTab !== "templates") {
            closeEditor();
            hideMenu();
        }
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
        renderTemplateList(settings.templates || {});
    }

    function open() {
        syncForm(loadSettings());
        setTab(activeTab);
        modalEl.hidden = false;
        openBtn?.setAttribute("aria-pressed", "true");
        if (activeTab === "geral") {
            wordWrapInput?.focus();
        }
    }

    function close() {
        hideMenu();
        closeEditor();
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

    modalEl?.querySelectorAll("[data-settings-tab]").forEach((btn) => {
        btn.addEventListener("click", () => setTab(btn.getAttribute("data-settings-tab")));
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
        setTab("templates");
        openEditor("", "", null);
    });

    templateEditorEl?.querySelector("[data-template-save]")?.addEventListener("click", () => {
        saveEditor();
    });
    templateEditorEl?.querySelector("[data-template-cancel]")?.addEventListener("click", () => {
        closeEditor();
    });

    document.addEventListener("pointerdown", (event) => {
        if (menuEl && !menuEl.contains(event.target) && !event.target.closest(".template-kebab")) {
            hideMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isOpen()) {
            if (menuEl) {
                hideMenu();
                return;
            }
            if (templateEditorEl && !templateEditorEl.hidden) {
                closeEditor();
                return;
            }
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
