/**
 * Catálogo estático de completação LaTeX (comandos e ambientes comuns).
 * insert: use $0 para posição final do cursor.
 */

const COMMANDS = [
    { label: "\\documentclass{}", insert: "\\documentclass{$0}", detail: "Classe do documento" },
    { label: "\\usepackage{}", insert: "\\usepackage{$0}", detail: "Pacote" },
    { label: "\\usepackage[]{}", insert: "\\usepackage[$0]{}", detail: "Pacote com opções" },
    { label: "\\title{}", insert: "\\title{$0}", detail: "Título" },
    { label: "\\author{}", insert: "\\author{$0}", detail: "Autor" },
    { label: "\\date{}", insert: "\\date{$0}", detail: "Data" },
    { label: "\\maketitle", insert: "\\maketitle", detail: "Imprime título" },
    { label: "\\tableofcontents", insert: "\\tableofcontents", detail: "Sumário" },
    { label: "\\newpage", insert: "\\newpage", detail: "Nova página" },
    { label: "\\clearpage", insert: "\\clearpage", detail: "Quebra de página" },
    { label: "\\pagebreak", insert: "\\pagebreak", detail: "Sugere quebra" },
    { label: "\\noindent", insert: "\\noindent", detail: "Sem indentação" },
    { label: "\\newline", insert: "\\newline", detail: "Nova linha" },
    { label: "\\linebreak", insert: "\\linebreak", detail: "Quebra de linha" },
    { label: "\\hfill", insert: "\\hfill", detail: "Espaço horizontal" },
    { label: "\\vfill", insert: "\\vfill", detail: "Espaço vertical" },
    { label: "\\hspace{}", insert: "\\hspace{$0}", detail: "Espaço horizontal" },
    { label: "\\vspace{}", insert: "\\vspace{$0}", detail: "Espaço vertical" },
    { label: "\\section{}", insert: "\\section{$0}", detail: "Seção" },
    { label: "\\subsection{}", insert: "\\subsection{$0}", detail: "Subseção" },
    { label: "\\subsubsection{}", insert: "\\subsubsection{$0}", detail: "Subsubseção" },
    { label: "\\paragraph{}", insert: "\\paragraph{$0}", detail: "Parágrafo" },
    { label: "\\chapter{}", insert: "\\chapter{$0}", detail: "Capítulo" },
    { label: "\\part{}", insert: "\\part{$0}", detail: "Parte" },
    { label: "\\label{}", insert: "\\label{$0}", detail: "Rótulo" },
    { label: "\\ref{}", insert: "\\ref{$0}", detail: "Referência" },
    { label: "\\pageref{}", insert: "\\pageref{$0}", detail: "Página da ref." },
    { label: "\\eqref{}", insert: "\\eqref{$0}", detail: "Eq. (amsmath)" },
    { label: "\\cite{}", insert: "\\cite{$0}", detail: "Citação" },
    { label: "\\citep{}", insert: "\\footnote{$0}", detail: "Nota de rodapé" },
    { label: "\\emph{}", insert: "\\emph{$0}", detail: "Ênfase" },
    { label: "\\textbf{}", insert: "\\textbf{$0}", detail: "Negrito" },
    { label: "\\textit{}", insert: "\\textit{$0}", detail: "Itálico" },
    { label: "\\texttt{}", insert: "\\texttt{$0}", detail: "Monoespaçado" },
    { label: "\\underline{}", insert: "\\underline{$0}", detail: "Sublinhado" },
    { label: "\\textsc{}", insert: "\\textsc{$0}", detail: "Small caps" },
    { label: "\\textcolor{}{}", insert: "\\textcolor{$0}{}", detail: "Cor do texto" },
    { label: "\\colorbox{}{}", insert: "\\colorbox{$0}{}", detail: "Fundo colorido" },
    { label: "\\url{}", insert: "\\url{$0}", detail: "URL (hyperref/url)" },
    { label: "\\href{}{}", insert: "\\href{$0}{}", detail: "Link (hyperref)" },
    { label: "\\includegraphics{}", insert: "\\includegraphics{$0}", detail: "Imagem" },
    { label: "\\includegraphics[]{}", insert: "\\includegraphics[width=$0\\textwidth]{}", detail: "Imagem com opções" },
    { label: "\\caption{}", insert: "\\caption{$0}", detail: "Legenda" },
    { label: "\\centering", insert: "\\centering", detail: "Centralizar" },
    { label: "\\linewidth", insert: "\\linewidth", detail: "Largura da linha" },
    { label: "\\textwidth", insert: "\\textwidth", detail: "Largura do texto" },
    { label: "\\item", insert: "\\item $0", detail: "Item de lista" },
    { label: "\\item[]", insert: "\\item[$0]", detail: "Item com rótulo" },
    { label: "\\frac{}{}", insert: "\\frac{$0}{}", detail: "Fração" },
    { label: "\\sqrt{}", insert: "\\sqrt{$0}", detail: "Raiz" },
    { label: "\\sum", insert: "\\sum_{$0}", detail: "Somatório" },
    { label: "\\int", insert: "\\int_{$0}", detail: "Integral" },
    { label: "\\lim", insert: "\\lim_{$0}", detail: "Limite" },
    { label: "\\infty", insert: "\\infty", detail: "Infinito" },
    { label: "\\alpha", insert: "\\alpha", detail: "α" },
    { label: "\\beta", insert: "\\beta", detail: "β" },
    { label: "\\gamma", insert: "\\gamma", detail: "γ" },
    { label: "\\delta", insert: "\\delta", detail: "δ" },
    { label: "\\epsilon", insert: "\\epsilon", detail: "ε" },
    { label: "\\theta", insert: "\\theta", detail: "θ" },
    { label: "\\lambda", insert: "\\lambda", detail: "λ" },
    { label: "\\mu", insert: "\\mu", detail: "μ" },
    { label: "\\pi", insert: "\\pi", detail: "π" },
    { label: "\\sigma", insert: "\\sigma", detail: "σ" },
    { label: "\\phi", insert: "\\phi", detail: "φ" },
    { label: "\\omega", insert: "\\omega", detail: "ω" },
    { label: "\\mathbb{}", insert: "\\mathbb{$0}", detail: "Blackboard bold" },
    { label: "\\mathrm{}", insert: "\\mathrm{$0}", detail: "Romano em math" },
    { label: "\\mathbf{}", insert: "\\mathbf{$0}", detail: "Negrito em math" },
    { label: "\\input{}", insert: "\\input{$0}", detail: "Inclui arquivo" },
    { label: "\\include{}", insert: "\\include{$0}", detail: "Inclui capítulo" },
    { label: "\\bibliography{}", insert: "\\bibliography{$0}", detail: "Bibliografia" },
    { label: "\\bibliographystyle{}", insert: "\\bibliographystyle{$0}", detail: "Estilo bib" },
];

const ENVIRONMENTS = [
    "document",
    "abstract",
    "itemize",
    "enumerate",
    "description",
    "center",
    "flushleft",
    "flushright",
    "quote",
    "quotation",
    "verse",
    "verbatim",
    "figure",
    "table",
    "tabular",
    "minipage",
    "equation",
    "equation*",
    "align",
    "align*",
    "gather",
    "multline",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "vmatrix",
    "theorem",
    "proof",
    "lemma",
    "definition",
    "example",
    "frame",
];

const ENV_SNIPPETS = {
    itemize: "\\begin{itemize}\n\t\\item $0\n\\end{itemize}",
    enumerate: "\\begin{enumerate}\n\t\\item $0\n\\end{enumerate}",
    description: "\\begin{description}\n\t\\item[$0] \n\\end{description}",
    figure: "\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{$0}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}",
    table: "\\begin{table}[htbp]\n\t\\centering\n\t\\caption{$0}\n\t\\label{tab:}\n\t\\begin{tabular}{cc}\n\t\t & \\\\\n\t\\end{tabular}\n\\end{table}",
    equation: "\\begin{equation}\n\t$0\n\\end{equation}",
    "equation*": "\\begin{equation*}\n\t$0\n\\end{equation*}",
    align: "\\begin{align}\n\t$0\n\\end{align}",
    "align*": "\\begin{align*}\n\t$0\n\\end{align*}",
    frame: "\\begin{frame}{$0}\n\t\n\\end{frame}",
    minipage: "\\begin{minipage}{$0\\textwidth}\n\t\n\\end{minipage}",
    tabular: "\\begin{tabular}{$0}\n\t & \\\\\n\\end{tabular}",
};

function commandInsert(name) {
    return `\\${name}`;
}

export function listCommandSuggestions(query = "") {
    const q = String(query || "").toLowerCase();
    return COMMANDS.filter((item) => {
        const key = item.label.slice(1).toLowerCase();
        return !q || key.startsWith(q) || item.label.toLowerCase().includes(q);
    }).map((item) => ({
        ...item,
        kind: "cmd",
    }));
}

export function listEnvironmentSuggestions(query = "", mode = "begin") {
    const q = String(query || "").toLowerCase();
    return ENVIRONMENTS.filter((name) => !q || name.toLowerCase().startsWith(q)).map((name) => {
        if (mode === "end") {
            return {
                label: `\\end{${name}}`,
                insert: `\\end{${name}}`,
                detail: "Ambiente",
                kind: "env",
            };
        }
        const snippet = ENV_SNIPPETS[name];
        return {
            label: `\\begin{${name}}`,
            insert: snippet || `\\begin{${name}}\n\t$0\n\\end{${name}}`,
            detail: "Ambiente",
            kind: "env",
        };
    });
}

export function buildFileSuggestions(paths, query = "", command = "input") {
    const q = String(query || "").toLowerCase();
    const cmd = command === "include" ? "include" : "input";
    return (paths || [])
        .filter((path) => /\.tex$/i.test(path))
        .map((path) => path.replace(/\.tex$/i, ""))
        .filter((stem) => !q || stem.toLowerCase().includes(q))
        .slice(0, 40)
        .map((stem) => ({
            label: `\\${cmd}{${stem}}`,
            insert: `\\${cmd}{${stem}}`,
            detail: "Arquivo do projeto",
            kind: "file",
        }));
}

export { commandInsert, ENVIRONMENTS, COMMANDS };
