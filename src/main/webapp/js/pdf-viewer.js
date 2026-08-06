const PDFJS_VERSION = "4.4.168";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

let pdfjsLibPromise = null;

async function loadPdfJs() {
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = import(`${PDFJS_CDN}/pdf.min.mjs`).then((mod) => {
            mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
            return mod;
        });
    }
    return pdfjsLibPromise;
}

/**
 * Renderiza PDF embutido (sem toolbar nativa do Chrome) em containerEl.
 */
export async function renderEmbeddedPdf(containerEl, pdfUrl, { scale = 1.15 } = {}) {
    const pdfjsLib = await loadPdfJs();
    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
    const pdf = await loadingTask.promise;

    containerEl.innerHTML = "";
    const stage = document.createElement("div");
    stage.className = "pdfjs-stage";
    containerEl.appendChild(stage);

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.className = "pdfjs-page";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute("aria-label", `Página ${pageNum} de ${pdf.numPages}`);
        const ctx = canvas.getContext("2d", { alpha: false });
        stage.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
    }

    return { pages: pdf.numPages };
}
