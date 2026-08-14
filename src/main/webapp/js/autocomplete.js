import { replaceRange } from "./editor.js";
import {
    buildFileSuggestions,
    listCommandSuggestions,
    listEnvironmentSuggestions,
} from "./latex-catalog.js";

const MAX_ITEMS = 12;

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function getCaretCoordinates(textarea, position) {
    const mirror = document.createElement("div");
    const style = window.getComputedStyle(textarea);
    const props = [
        "boxSizing",
        "width",
        "height",
        "overflowX",
        "overflowY",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "fontStyle",
        "fontVariant",
        "fontWeight",
        "fontStretch",
        "fontSize",
        "fontSizeAdjust",
        "lineHeight",
        "fontFamily",
        "textAlign",
        "textTransform",
        "textIndent",
        "textDecoration",
        "letterSpacing",
        "wordSpacing",
        "tabSize",
        "MozTabSize",
        "whiteSpace",
        "wordWrap",
        "wordBreak",
    ];
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    for (const prop of props) {
        mirror.style[prop] = style[prop];
    }
    mirror.style.overflow = "hidden";
    mirror.style.height = "auto";

    const value = textarea.value.slice(0, position);
    mirror.textContent = value;
    const marker = document.createElement("span");
    marker.textContent = textarea.value.slice(position) || ".";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const rect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const top = rect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
    const left = rect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
    mirror.remove();
    return { top, left, lineHeight: Number.parseFloat(style.lineHeight) || 20 };
}

function detectTrigger(value, caret) {
    const before = value.slice(0, caret);

    let match = before.match(/\\(begin|end)\{([A-Za-z*]*)$/);
    if (match) {
        return {
            kind: "env",
            mode: match[1],
            query: match[2],
            from: caret - match[0].length,
            to: caret,
        };
    }

    match = before.match(/\\template\{([^{}\n]*)$/);
    if (match) {
        return {
            kind: "template",
            query: match[1],
            from: caret - match[0].length,
            to: caret,
        };
    }

    match = before.match(/\\(input|include)\{([^}\n]*)$/);
    if (match) {
        return {
            kind: "file",
            command: match[1],
            query: match[2],
            from: caret - match[0].length,
            to: caret,
        };
    }

    match = before.match(/\\([A-Za-z@]*)$/);
    if (match) {
        return {
            kind: "cmd",
            query: match[1],
            from: caret - match[0].length,
            to: caret,
        };
    }

    return null;
}

function applySnippet(editor, from, to, insertText) {
    const marker = insertText.indexOf("$0");
    const plain = insertText.replace("$0", "");
    const caret = from + (marker >= 0 ? marker : plain.length);
    replaceRange(editor, from, to, plain, caret);
    editor.focus();
}

export function createAutocomplete({ editor, getProjectTexPaths, getTemplates }) {
    const popup = document.createElement("div");
    popup.className = "ac-popup";
    popup.hidden = true;
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", "Sugestões LaTeX");
    document.body.appendChild(popup);

    let items = [];
    let activeIndex = 0;
    let trigger = null;
    let open = false;

    function isOpen() {
        return open;
    }

    function hide() {
        open = false;
        trigger = null;
        items = [];
        activeIndex = 0;
        popup.hidden = true;
        popup.innerHTML = "";
    }

    function renderList() {
        if (!items.length) {
            hide();
            return;
        }
        popup.innerHTML = items
            .map(
                (item, index) => `
                <button
                    type="button"
                    class="ac-item${index === activeIndex ? " is-active" : ""}"
                    role="option"
                    data-index="${index}"
                    aria-selected="${index === activeIndex}"
                >
                    <span class="ac-label">${escapeHtml(item.label)}</span>
                    <span class="ac-detail">${escapeHtml(item.detail || "")}</span>
                </button>
            `
            )
            .join("");
        popup.hidden = false;
        open = true;
        const active = popup.querySelector(".ac-item.is-active");
        active?.scrollIntoView({ block: "nearest" });
    }

    function positionPopup() {
        if (!trigger) {
            return;
        }
        const coords = getCaretCoordinates(editor, trigger.to);
        const lineH = coords.lineHeight || 20;
        let top = coords.top + lineH + 4;
        let left = coords.left;
        popup.style.top = `${Math.max(8, top)}px`;
        popup.style.left = `${Math.max(8, left)}px`;
        // Reposiciona se sair da viewport
        const rect = popup.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8) {
            top = coords.top - rect.height - 4;
            popup.style.top = `${Math.max(8, top)}px`;
        }
        if (rect.right > window.innerWidth - 8) {
            left = window.innerWidth - rect.width - 8;
            popup.style.left = `${Math.max(8, left)}px`;
        }
    }

    function collectItems(currentTrigger) {
        if (!currentTrigger) {
            return [];
        }
        if (currentTrigger.kind === "env") {
            return listEnvironmentSuggestions(currentTrigger.query, currentTrigger.mode).slice(0, MAX_ITEMS);
        }
        if (currentTrigger.kind === "file") {
            const paths = typeof getProjectTexPaths === "function" ? getProjectTexPaths() : [];
            return buildFileSuggestions(paths, currentTrigger.query, currentTrigger.command).slice(
                0,
                MAX_ITEMS
            );
        }
        if (currentTrigger.kind === "template") {
            const templates = typeof getTemplates === "function" ? getTemplates() : {};
            const query = (currentTrigger.query || "").toLowerCase();
            return Object.keys(templates)
                .filter((name) => !query || name.toLowerCase().includes(query))
                .slice(0, MAX_ITEMS)
                .map((name) => ({
                    label: `\\template{${name}}`,
                    insert: String(templates[name] ?? ""),
                    detail: "Template",
                }));
        }
        return listCommandSuggestions(currentTrigger.query).slice(0, MAX_ITEMS);
    }

    function refresh({ force = false } = {}) {
        if (editor.readOnly) {
            hide();
            return;
        }
        const caret = editor.selectionStart;
        if (editor.selectionEnd !== caret) {
            hide();
            return;
        }
        const next = detectTrigger(editor.value, caret);
        if (!next) {
            hide();
            return;
        }
        // Só abre sozinho após começar a digitar (ou Ctrl+Space)
        if (!force && next.kind === "cmd" && next.query.length < 1) {
            hide();
            return;
        }
        const nextItems = collectItems(next);
        if (!nextItems.length) {
            hide();
            return;
        }
        trigger = next;
        items = nextItems;
        activeIndex = 0;
        renderList();
        positionPopup();
    }

    function accept(index = activeIndex) {
        if (!open || !trigger || !items[index]) {
            return false;
        }
        const item = items[index];
        applySnippet(editor, trigger.from, trigger.to, item.insert);
        hide();
        return true;
    }

    function move(delta) {
        if (!open || !items.length) {
            return;
        }
        activeIndex = (activeIndex + delta + items.length) % items.length;
        renderList();
    }

    function onKeyDown(event) {
        if (editor.readOnly) {
            return false;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === " ") {
            event.preventDefault();
            refresh({ force: true });
            return true;
        }

        if (!open) {
            return false;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
            return true;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
            return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            accept();
            return true;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            hide();
            return true;
        }
        return false;
    }

    popup.addEventListener("mousedown", (event) => {
        const btn = event.target.closest("[data-index]");
        if (!btn) {
            return;
        }
        event.preventDefault();
        accept(Number(btn.dataset.index));
    });

    editor.addEventListener("blur", () => {
        // Delay para permitir clique na lista
        window.setTimeout(() => {
            if (!popup.contains(document.activeElement)) {
                hide();
            }
        }, 120);
    });

    editor.addEventListener("scroll", () => {
        if (open) {
            hide();
        }
    });

    window.addEventListener("resize", () => {
        if (open) {
            hide();
        }
    });

    return {
        refresh,
        hide,
        isOpen,
        onKeyDown,
        accept,
    };
}
