import { replaceRange } from "./editor.js";

const TEMPLATE_PATTERN = /\\template\{([^{}\n]+)\}$/;

export function tryExpandTemplate(editor, templates) {
    if (!editor || !templates || typeof templates !== "object") {
        return false;
    }
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const match = before.match(TEMPLATE_PATTERN);
    if (!match) {
        return false;
    }
    const name = match[1].trim();
    const content = templates[name];
    if (content === undefined) {
        return false;
    }
    const start = pos - match[0].length;
    replaceRange(editor, start, pos, content);
    return true;
}

export function bindTemplateExpansion(editor, getTemplates, onApplied) {
    if (!editor) {
        return;
    }

    let expanding = false;
    const attempt = () => {
        if (expanding) {
            return false;
        }
        expanding = true;
        try {
            if (tryExpandTemplate(editor, getTemplates())) {
                onApplied?.();
                return true;
            }
            return false;
        } finally {
            expanding = false;
        }
    };

    editor.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" && event.key !== "Enter") {
            return;
        }
        if (attempt()) {
            event.preventDefault();
        }
    });

    editor.addEventListener("input", () => {
        const pos = editor.selectionStart;
        if (editor.value.charAt(pos - 1) === "}") {
            attempt();
        }
    });
}
