export const SAMPLE_DOCUMENT = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\title{Introdução ao LaTexedit}
\\author{Seu Nome}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Bem-vindo}
Este é um editor e leitor de \\LaTeX{} no navegador.
Você pode escrever equações como $E = mc^2$ ou blocos:

\\[
\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)
\\]

\\subsection{Ambientes}
\\begin{itemize}
  \\item Edite o código à esquerda
  \\item Veja o preview à direita
  \\item Salve ou abra arquivos \\texttt{.tex}
\\end{itemize}

\\begin{theorem}
A soma dos ângulos internos de um triângulo é $180^\\circ$.
\\end{theorem}

\\end{document}
`;

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
