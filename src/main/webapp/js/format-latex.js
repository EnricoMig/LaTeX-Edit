export const LATEX_INDENT = "\t";

const VERBATIM_ENVS = new Set([
    "verbatim",
    "Verbatim",
    "lstlisting",
    "minted",
    "alltt",
    "filecontents",
    "filecontents*",
    "comment",
]);

const ENV_TOKEN_SOURCE = "\\\\(begin|end)\\{([A-Za-z*]+)\\}";

function isCommentStart(line, index) {
    if (line.charAt(index) !== "%") {
        return false;
    }
    let slashes = 0;
    for (let i = index - 1; i >= 0 && line.charAt(i) === "\\"; i -= 1) {
        slashes += 1;
    }
    return slashes % 2 === 0;
}

export function stripTrailingComment(line) {
    for (let i = 0; i < line.length; i += 1) {
        if (isCommentStart(line, i)) {
            return { code: line.slice(0, i), comment: line.slice(i) };
        }
    }
    return { code: line, comment: "" };
}

export function envTokens(code) {
    return [...String(code ?? "").matchAll(new RegExp(ENV_TOKEN_SOURCE, "g"))].map((match) => ({
        kind: match[1],
        name: match[2],
    }));
}

function leadingEndCount(tokens) {
    let count = 0;
    for (const token of tokens) {
        if (token.kind !== "end") {
            break;
        }
        count += 1;
    }
    return count;
}

/**
 * Reindenta o source pela aninhamento de \\begin / \\end (como tags HTML).
 * Interior de verbatim/lstlisting/minted é preservado.
 */
export function formatLatexIndent(source, indent = LATEX_INDENT) {
    const lines = String(source ?? "").split("\n");
    const stack = [];
    const out = [];
    let verbatim = null;

    for (const line of lines) {
        if (verbatim) {
            const trimmed = line.trim();
            const endName = trimmed.match(/^\\end\{([A-Za-z*]+)\}/)?.[1];
            if (endName === verbatim) {
                const depth = Math.max(0, stack.length - 1);
                out.push(trimmed ? indent.repeat(depth) + trimmed : "");
                stack.pop();
                verbatim = null;
                continue;
            }
            out.push(line);
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            out.push("");
            continue;
        }

        const tokens = envTokens(stripTrailingComment(trimmed).code);
        const depth = Math.max(0, stack.length - leadingEndCount(tokens));
        out.push(indent.repeat(depth) + trimmed);

        for (const token of tokens) {
            if (token.kind === "begin") {
                stack.push(token.name);
                if (VERBATIM_ENVS.has(token.name) && !verbatim) {
                    verbatim = token.name;
                }
                continue;
            }
            if (!stack.length) {
                continue;
            }
            const idx = stack.lastIndexOf(token.name);
            if (idx >= 0) {
                stack.length = idx;
            } else {
                stack.pop();
            }
            if (verbatim && token.name === verbatim) {
                verbatim = null;
            }
        }
    }

    return out.join("\n");
}

export function caretAfterFormat(oldValue, newValue, pos) {
    const safePos = Math.max(0, Math.min(pos, oldValue.length));
    const before = oldValue.slice(0, safePos);
    const lineIndex = before.split("\n").length - 1;
    const oldLine = oldValue.split("\n")[lineIndex] ?? "";
    const col = safePos - (before.lastIndexOf("\n") + 1);
    const oldIndent = (oldLine.match(/^[ \t]*/) || [""])[0].length;
    const newLines = newValue.split("\n");
    const target = Math.min(lineIndex, Math.max(0, newLines.length - 1));
    const newLine = newLines[target] ?? "";
    const newIndent = (newLine.match(/^[ \t]*/) || [""])[0].length;
    const newCol = Math.min(newLine.length, newIndent + Math.max(0, col - oldIndent));
    let offset = 0;
    for (let i = 0; i < target; i += 1) {
        offset += newLines[i].length + 1;
    }
    return offset + newCol;
}
