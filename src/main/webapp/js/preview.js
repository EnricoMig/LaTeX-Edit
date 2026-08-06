function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function extractCommandArg(source, command) {
    const re = new RegExp(`\\\\${command}\\s*\\{([^}]*)\\}`);
    const match = source.match(re);
    return match ? match[1].trim() : "";
}

function stripComments(source) {
    return source
        .split("\n")
        .map((line) => {
            let out = "";
            let escaped = false;
            for (let i = 0; i < line.length; i += 1) {
                const ch = line[i];
                if (ch === "\\" && !escaped) {
                    escaped = true;
                    out += ch;
                    continue;
                }
                if (ch === "%" && !escaped) {
                    break;
                }
                out += ch;
                escaped = false;
            }
            return out;
        })
        .join("\n");
}

function convertInlineFormatting(text) {
    let out = escapeHtml(text);
    out = out.replace(/\\texttt\{([^}]*)\}/g, "<code>$1</code>");
    out = out.replace(/\\textbf\{([^}]*)\}/g, "<strong>$1</strong>");
    out = out.replace(/\\textit\{([^}]*)\}/g, "<em>$1</em>");
    out = out.replace(/\\emph\{([^}]*)\}/g, "<em>$1</em>");
    out = out.replace(/\\LaTeX\{\}/g, "LaTeX");
    out = out.replace(/\\LaTeX/g, "LaTeX");
    out = out.replace(/\\\\/g, "<br>");
    out = out.replace(/~/g, "&nbsp;");
    out = out.replace(/---/g, "—");
    out = out.replace(/--/g, "–");
    return out;
}

function convertMathPlaceholders(text) {
    const blocks = [];
    let out = text;

    out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) => {
        const id = blocks.length;
        blocks.push({ display: true, expr: expr.trim() });
        return `%%MATH${id}%%`;
    });

    out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
        const id = blocks.length;
        blocks.push({ display: true, expr: expr.trim() });
        return `%%MATH${id}%%`;
    });

    out = out.replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
        const id = blocks.length;
        blocks.push({ display: false, expr: expr.trim() });
        return `%%MATH${id}%%`;
    });

    return { text: out, blocks };
}

function restoreMath(html, blocks) {
    return html.replace(/%%MATH(\d+)%%/g, (_, index) => {
        const item = blocks[Number(index)];
        if (!item || typeof katex === "undefined") {
            return escapeHtml(item?.expr ?? "");
        }
        try {
            const rendered = katex.renderToString(item.expr, {
                displayMode: item.display,
                throwOnError: false,
                strict: "ignore",
            });
            return item.display
                ? `<div class="math-block">${rendered}</div>`
                : rendered;
        } catch (error) {
            console.error("Falha ao renderizar matemática:", error);
            return `<code>${escapeHtml(item.expr)}</code>`;
        }
    });
}

function parseBody(body) {
    const { text: withPlaceholders, blocks } = convertMathPlaceholders(body);
    let working = withPlaceholders;

    working = working.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, inner) => {
        const items = [...inner.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)]
            .map((m) => `<li class="item">${convertInlineFormatting(m[1].trim())}</li>`)
            .join("");
        return `%%BLOCK<ul>${items}</ul>%%`;
    });

    working = working.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, inner) => {
        const items = [...inner.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)]
            .map((m) => `<li class="item">${convertInlineFormatting(m[1].trim())}</li>`)
            .join("");
        return `%%BLOCK<ol>${items}</ol>%%`;
    });

    working = working.replace(
        /\\begin\{(theorem|lemma|proof|definition|example|abstract)\}([\s\S]*?)\\end\{\1\}/g,
        (_, env, inner) => {
            const label = env.charAt(0).toUpperCase() + env.slice(1);
            return `%%BLOCK<div class="env-block"><span class="env-label">${label}</span>${convertInlineFormatting(inner.trim())}</div>%%`;
        }
    );

    working = working.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_, inner) => {
        const content = escapeHtml(inner.replace(/^\n/, "").replace(/\n$/, ""));
        return `%%BLOCK<pre class="verbatim">${content}</pre>%%`;
    });

    working = working.replace(/\\section\*?\{([^}]*)\}/g, (_, title) => {
        return `\n%%BLOCK<h3 class="section">${convertInlineFormatting(title)}</h3>%%\n`;
    });

    working = working.replace(/\\subsection\*?\{([^}]*)\}/g, (_, title) => {
        return `\n%%BLOCK<h4 class="subsection">${convertInlineFormatting(title)}</h4>%%\n`;
    });

    working = working.replace(/\\maketitle/g, "");
    working = working.replace(/\\tableofcontents/g, "");
    working = working.replace(/\\newpage/g, "\n%%BLOCK<hr>%%\n");

    const parts = working.split(/\n{2,}/);
    const htmlParts = parts.map((part) => {
        const trimmed = part.trim();
        if (!trimmed) {
            return "";
        }

        if (trimmed.startsWith("%%BLOCK") && trimmed.endsWith("%%")) {
            return trimmed.slice("%%BLOCK".length, -2);
        }

        if (trimmed.includes("%%BLOCK")) {
            return trimmed
                .replace(/%%BLOCK([\s\S]*?)%%/g, "$1")
                .split(/(<[^>]+>)/g)
                .map((chunk) => (chunk.startsWith("<") ? chunk : convertInlineFormatting(chunk)))
                .join("");
        }

        if (trimmed.startsWith("%%MATH") && !trimmed.includes("\n")) {
            return trimmed;
        }

        return `<p>${convertInlineFormatting(trimmed)}</p>`;
    });

    return restoreMath(htmlParts.join("\n"), blocks);
}

function resolvePath(fromFile, target) {
    const cleanTarget = String(target || "")
        .replaceAll("\\", "/")
        .replace(/^\/+/, "")
        .replace(/\.tex$/i, "");
    const fromDir = String(fromFile || "")
        .replaceAll("\\", "/")
        .split("/")
        .slice(0, -1)
        .filter(Boolean);

    const parts = [...fromDir, ...cleanTarget.split("/")];
    const stack = [];
    for (const part of parts) {
        if (!part || part === ".") {
            continue;
        }
        if (part === "..") {
            stack.pop();
            continue;
        }
        stack.push(part);
    }
    return stack.join("/");
}

function expandInputs(source, { readFile, currentPath = "", depth = 0, seen = new Set() } = {}) {
    if (!readFile || depth > 8) {
        return source;
    }

    return source.replace(/\\(input|include)\s*\{([^}]+)\}/g, (full, command, target) => {
        const base = resolvePath(currentPath, target.trim());
        const candidates = [`${base}.tex`, base];
        let content = null;
        let resolved = null;

        for (const candidate of candidates) {
            if (seen.has(candidate)) {
                return `% circular ${command}{${target}}`;
            }
            try {
                content = readFile(candidate);
                resolved = candidate;
                break;
            } catch {
                // tenta próximo candidato
            }
        }

        if (content == null || resolved == null) {
            return `\\textit{[arquivo não encontrado: ${command}\\{${target}\\}]}`;
        }

        const nextSeen = new Set(seen);
        nextSeen.add(resolved);
        const expanded = expandInputs(content, {
            readFile,
            currentPath: resolved,
            depth: depth + 1,
            seen: nextSeen,
        });
        return `\n% begin ${command}{${target}}\n${expanded}\n% end ${command}{${target}}\n`;
    });
}

export function buildPreviewHtml(source, options = {}) {
    const withInputs = expandInputs(source, {
        readFile: options.readFile,
        currentPath: options.currentPath || "",
    });
    const cleaned = stripComments(withInputs);
    const title = extractCommandArg(cleaned, "title") || "Documento sem título";
    const author = extractCommandArg(cleaned, "author");
    const dateCmd = extractCommandArg(cleaned, "date");
    const date =
        !dateCmd || dateCmd === "\\today"
            ? new Date().toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : dateCmd;

    const beginMatch = cleaned.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    const body = beginMatch ? beginMatch[1] : cleaned;
    const bodyHtml = parseBody(body);

    return `
        <h1 class="doc-title">${convertInlineFormatting(title)}</h1>
        ${author ? `<p class="doc-author">${convertInlineFormatting(author)}</p>` : ""}
        <p class="doc-date">${convertInlineFormatting(date)}</p>
        ${bodyHtml}
        <p class="preview-note">Preview com \\input/\\include resolvidos no projeto. Compilação PDF virá com o backend.</p>
    `;
}
