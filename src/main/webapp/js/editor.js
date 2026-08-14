import {
    LATEX_INDENT,
    caretAfterFormat,
    envTokens,
    formatLatexIndent,
    stripTrailingComment,
} from "./format-latex.js";

/** Template gerado ao criar uma pasta raiz de projeto. */
export const DEFAULT_PROJECT_MAIN = `\\documentclass{article}
\\usepackage{graphicx} % Required for inserting images

\\title{teste}
\\author{Enrico Migliorini}
\\date{August 2026}

\\begin{document}

\\maketitle

\\section{Introduction}

\\end{document}
`;

/** @deprecated Use DEFAULT_PROJECT_MAIN */
export const SAMPLE_DOCUMENT = DEFAULT_PROJECT_MAIN;

export function updateLineNumbers(editor, lineNumbersEl) {
    const lines = editor.value.split("\n").length;
    let html = "";
    for (let i = 1; i <= lines; i += 1) {
        html += `${i}\n`;
    }
    lineNumbersEl.textContent = html || "1\n";
}

export function updateCursorMeta(editor, cursorPosEl, charCountEl) {
    const value = editor.value;
    const pos = editor.selectionStart;
    const before = value.slice(0, pos);
    const line = before.split("\n").length;
    const col = before.length - before.lastIndexOf("\n");
    cursorPosEl.textContent = `Ln ${line}, Col ${col}`;
    charCountEl.textContent = `${value.length} caracteres`;
}

/**
 * Substitui [from, to) no textarea. Quem chama `editor.value =` apaga o undo
 * nativo; o histórico em undo.js cobre essas edições programáticas.
 */
export function replaceRange(editor, from, to, text, caret = null) {
    const start = Math.max(0, Math.min(from, to));
    const end = Math.max(from, to);
    const insertion = String(text ?? "");
    const value = editor.value;
    editor.value = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    if (caret && typeof caret === "object") {
        editor.selectionStart = caret.start;
        editor.selectionEnd = caret.end;
    } else {
        const caretPos = caret == null ? start + insertion.length : caret;
        editor.selectionStart = editor.selectionEnd = caretPos;
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
}

export function insertTab(editor) {
    replaceRange(editor, editor.selectionStart, editor.selectionEnd, LATEX_INDENT);
}

function lineIndent(text) {
    return (text.match(/^[ \t]*/) || [""])[0];
}

function netEnvDelta(text) {
    let delta = 0;
    for (const token of envTokens(stripTrailingComment(text).code)) {
        delta += token.kind === "begin" ? 1 : -1;
    }
    return delta;
}

/** Enter: copia indentação; após \\begin{...} aumenta um nível (como HTML). */
export function insertSmartNewline(editor) {
    const value = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const afterEnd = value.indexOf("\n", end);
    const lineEnd = afterEnd < 0 ? value.length : afterEnd;
    const before = value.slice(lineStart, start);
    const after = value.slice(end, lineEnd);
    const indent = lineIndent(before);
    const extra = netEnvDelta(before) > 0 ? LATEX_INDENT : "";
    const afterIsEnd = /^\\end\{[A-Za-z*]+\}/.test(after.trim());

    if (extra && afterIsEnd) {
        const insertion = `\n${indent}${extra}\n${indent}`;
        replaceRange(editor, start, end, insertion, start + 1 + indent.length + extra.length);
        return;
    }
    replaceRange(editor, start, end, `\n${indent}${extra}`);
}

export function indentSelection(editor, direction = 1) {
    const value = editor.value;
    const selStart = editor.selectionStart;
    const selEnd = editor.selectionEnd;
    const blockStart = value.lastIndexOf("\n", selStart - 1) + 1;
    const endsOnNewline = selEnd > selStart && value.charAt(selEnd - 1) === "\n";
    const nextBreak = value.indexOf("\n", selEnd);
    const blockEnd = endsOnNewline
        ? selEnd - 1
        : nextBreak < 0
          ? value.length
          : nextBreak;
    const block = value.slice(blockStart, blockEnd);
    const lines = block.split("\n");
    let pos = blockStart;
    let newStart = selStart;
    let newEnd = selEnd;
    const nextLines = lines.map((line, index) => {
        let delta = 0;
        let next = line;
        if (direction > 0) {
            next = LATEX_INDENT + line;
            delta = LATEX_INDENT.length;
        } else {
            const match = line.match(/^(?:\t| {1,4})/);
            const removed = match ? match[0].length : 0;
            next = line.slice(removed);
            delta = -removed;
        }
        if (selStart >= pos) {
            newStart += delta;
        }
        if (selEnd >= pos) {
            newEnd += delta;
        }
        pos += line.length + (index < lines.length - 1 ? 1 : 0);
        return next;
    });
    replaceRange(editor, blockStart, blockEnd, nextLines.join("\n"), {
        start: Math.max(blockStart, newStart),
        end: Math.max(blockStart, newEnd),
    });
}

export function applyLatexFormat(editor) {
    const value = editor.value;
    const formatted = formatLatexIndent(value);
    if (formatted === value) {
        return false;
    }
    const start = caretAfterFormat(value, formatted, editor.selectionStart);
    const end = caretAfterFormat(value, formatted, editor.selectionEnd);
    replaceRange(editor, 0, value.length, formatted, {
        start: Math.min(start, end),
        end: Math.max(start, end),
    });
    return true;
}

export function insertAtCursor(editor, text) {
    replaceRange(editor, editor.selectionStart, editor.selectionEnd, text);
    editor.focus();
}

export function downloadTex(content, fileName) {
    const safeName = fileName.endsWith(".tex") ? fileName : `${fileName}.tex`;
    const blob = new Blob([content], { type: "application/x-tex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
