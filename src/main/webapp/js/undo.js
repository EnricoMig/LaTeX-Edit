const HISTORY_LIMIT = 200;
const COALESCE_MS = 400;

function snapshot(editor) {
    return {
        value: editor.value,
        start: editor.selectionStart,
        end: editor.selectionEnd,
    };
}

function kindFromInputType(inputType) {
    if (!inputType) {
        return "other";
    }
    if (inputType === "historyUndo" || inputType === "historyRedo") {
        return "history";
    }
    if (inputType.startsWith("insert")) {
        return "insert";
    }
    if (inputType.startsWith("delete")) {
        return "delete";
    }
    return "other";
}

/**
 * Undo/redo do textarea. Atribuições a `editor.value` (Tab, snippet, abrir
 * arquivo) zeram o histórico nativo do browser — este módulo substitui isso.
 */
export function createUndoHistory(editor, { limit = HISTORY_LIMIT, coalesceMs = COALESCE_MS } = {}) {
    let entries = [snapshot(editor)];
    let index = 0;
    let applying = false;
    let composing = false;
    let lastKind = null;
    let lastAt = 0;

    function reset() {
        entries = [snapshot(editor)];
        index = 0;
        lastKind = null;
        lastAt = 0;
    }

    function record(kind = "other") {
        if (applying) {
            return;
        }
        const state = snapshot(editor);
        const now = performance.now();
        if (entries[index]?.value === state.value) {
            entries[index] = state;
            return;
        }
        const merge =
            index === entries.length - 1 &&
            kind !== "other" &&
            kind === lastKind &&
            now - lastAt < coalesceMs;

        if (merge) {
            entries[index] = state;
        } else {
            entries = entries.slice(0, index + 1);
            entries.push(state);
            if (entries.length > limit) {
                entries.shift();
            }
            index = entries.length - 1;
        }
        lastKind = kind;
        lastAt = now;
    }

    function apply(state) {
        applying = true;
        editor.value = state.value;
        editor.selectionStart = state.start;
        editor.selectionEnd = state.end;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        applying = false;
        lastKind = null;
        lastAt = 0;
        editor.focus();
    }

    function undo() {
        if (editor.readOnly) {
            return false;
        }
        const current = snapshot(editor);
        if (entries[index] && entries[index].value !== current.value) {
            record("other");
        }
        if (index <= 0) {
            return false;
        }
        index -= 1;
        apply(entries[index]);
        return true;
    }

    function redo() {
        if (editor.readOnly) {
            return false;
        }
        if (index >= entries.length - 1) {
            return false;
        }
        index += 1;
        apply(entries[index]);
        return true;
    }

    editor.addEventListener("compositionstart", () => {
        composing = true;
    });
    editor.addEventListener("compositionend", () => {
        composing = false;
        record("insert");
    });
    editor.addEventListener("input", (event) => {
        if (applying || composing) {
            return;
        }
        const kind = kindFromInputType(event.inputType);
        if (kind === "history") {
            return;
        }
        record(kind);
    });
    editor.addEventListener("keydown", (event) => {
        if (editor.readOnly) {
            return;
        }
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
            event.preventDefault();
            undo();
            return;
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
            event.preventDefault();
            redo();
        }
    });
    editor.addEventListener("mousedown", () => {
        lastKind = null;
    });
    editor.addEventListener("keyup", (event) => {
        if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "Home" ||
            event.key === "End"
        ) {
            lastKind = null;
        }
    });

    return { undo, redo, reset, record };
}
