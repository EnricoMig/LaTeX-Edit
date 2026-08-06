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

export function insertTab(editor) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    editor.value = `${value.slice(0, start)}\t${value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + 1;
}

export function insertAtCursor(editor, text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    editor.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const caret = start + text.length;
    editor.selectionStart = editor.selectionEnd = caret;
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
