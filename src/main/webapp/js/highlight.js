function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function span(kind, text) {
    return `<span class="tok-${kind}">${escapeHtml(text)}</span>`;
}

/**
 * Highlight LaTeX for an overlay behind the textarea.
 */
export function highlightLatex(source) {
    const s = String(source ?? "");
    let i = 0;
    let out = "";

    while (i < s.length) {
        const ch = s[i];
        const prev = i > 0 ? s[i - 1] : "";

        if (ch === "%" && prev !== "\\") {
            const end = s.indexOf("\n", i);
            const slice = end < 0 ? s.slice(i) : s.slice(i, end);
            out += span("comment", slice);
            i += slice.length;
            continue;
        }

        if (s.startsWith("$$", i)) {
            const end = s.indexOf("$$", i + 2);
            const slice = end < 0 ? s.slice(i) : s.slice(i, end + 2);
            out += span("math", slice);
            i += slice.length;
            continue;
        }

        if (s.startsWith("\\[", i) || s.startsWith("\\(", i)) {
            const close = s.startsWith("\\[", i) ? "\\]" : "\\)";
            const end = s.indexOf(close, i + 2);
            const slice = end < 0 ? s.slice(i) : s.slice(i, end + close.length);
            out += span("math", slice);
            i += slice.length;
            continue;
        }

        if (ch === "$" && prev !== "\\") {
            const end = s.indexOf("$", i + 1);
            const slice = end < 0 ? s.slice(i) : s.slice(i, end + 1);
            out += span("math", slice);
            i += slice.length;
            continue;
        }

        if (ch === "\\" && i + 1 < s.length) {
            const next = s[i + 1];
            if (/[A-Za-z]/.test(next)) {
                let j = i + 1;
                while (j < s.length && /[A-Za-z]/.test(s[j])) {
                    j += 1;
                }
                const command = s.slice(i, j);
                if ((command === "\\begin" || command === "\\end") && s[j] === "{") {
                    let k = j + 1;
                    while (k < s.length && s[k] !== "}" && s[k] !== "\n") {
                        k += 1;
                    }
                    if (s[k] === "}") {
                        out += span("keyword", s.slice(i, k + 1));
                        i = k + 1;
                        continue;
                    }
                }
                out += span("command", command);
                i = j;
                continue;
            }
            out += span("command", s.slice(i, i + 2));
            i += 2;
            continue;
        }

        if (ch === "{" || ch === "}" || ch === "[" || ch === "]") {
            out += span("punct", ch);
            i += 1;
            continue;
        }

        out += escapeHtml(ch);
        i += 1;
    }

    return `${out}\n`;
}

export function bindSyntaxHighlight(editor, layer) {
    if (!editor || !layer) {
        return { paint() {} };
    }

    let frame = 0;

    function paint() {
        layer.innerHTML = highlightLatex(editor.value);
        layer.classList.toggle("is-word-wrap", editor.classList.contains("is-word-wrap"));
        layer.scrollTop = editor.scrollTop;
        layer.scrollLeft = editor.scrollLeft;
    }

    function schedule() {
        if (frame) {
            return;
        }
        frame = window.requestAnimationFrame(() => {
            frame = 0;
            paint();
        });
    }

    function syncScroll() {
        layer.scrollTop = editor.scrollTop;
        layer.scrollLeft = editor.scrollLeft;
    }

    editor.addEventListener("input", schedule);
    editor.addEventListener("scroll", syncScroll);
    const resizeObserver = new ResizeObserver(syncScroll);
    resizeObserver.observe(editor);

    paint();
    return { paint };
}
