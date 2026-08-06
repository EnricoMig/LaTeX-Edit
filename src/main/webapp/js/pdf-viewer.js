const PDFJS_VERSION = "4.4.168";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.15;

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
 * Viewer PDF.js com zoom e ajuste à largura do container.
 */
export class PdfViewer {
    constructor() {
        this.containerEl = null;
        this.pdf = null;
        this.pdfUrl = "";
        this.scale = 1;
        this.fitMode = "width";
        this.renderToken = 0;
        this.onScaleChange = null;
    }

    async open(containerEl, pdfUrl, { fit = "width" } = {}) {
        this.containerEl = containerEl;
        this.pdfUrl = pdfUrl;
        this.fitMode = fit;
        const pdfjsLib = await loadPdfJs();
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
        this.pdf = await loadingTask.promise;
        await this.render();
        return { pages: this.pdf.numPages };
    }

    clear() {
        this.renderToken += 1;
        this.pdf = null;
        this.pdfUrl = "";
        this.containerEl = null;
        this.scale = 1;
        this.fitMode = "width";
    }

    getScalePercent() {
        return Math.round(this.scale * 100);
    }

    async zoomIn() {
        this.fitMode = "manual";
        this.scale = Math.min(MAX_SCALE, this.scale + ZOOM_STEP);
        await this.render();
    }

    async zoomOut() {
        this.fitMode = "manual";
        this.scale = Math.max(MIN_SCALE, this.scale - ZOOM_STEP);
        await this.render();
    }

    async setScale(scale) {
        this.fitMode = "manual";
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
        await this.render();
    }

    async fitWidth() {
        this.fitMode = "width";
        await this.render();
    }

    async fitPage() {
        this.fitMode = "page";
        await this.render();
    }

    computeFitScale(page) {
        if (!this.containerEl) {
            return 1.15;
        }
        const host = this.containerEl;
        const styles = window.getComputedStyle(host);
        const padX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
        const padY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
        const availableWidth = Math.max(120, host.clientWidth - padX - 8);
        const availableHeight = Math.max(120, host.clientHeight - padY - 8);
        const base = page.getViewport({ scale: 1 });

        if (this.fitMode === "page") {
            const scaleW = availableWidth / base.width;
            const scaleH = availableHeight / base.height;
            return Math.min(scaleW, scaleH);
        }
        // width (default)
        return availableWidth / base.width;
    }

    async render() {
        if (!this.containerEl || !this.pdf) {
            return;
        }
        const token = ++this.renderToken;
        const stage = document.createElement("div");
        stage.className = "pdfjs-stage";

        const firstPage = await this.pdf.getPage(1);
        if (token !== this.renderToken) {
            return;
        }
        if (this.fitMode === "width" || this.fitMode === "page") {
            this.scale = this.computeFitScale(firstPage);
        }

        this.containerEl.innerHTML = "";
        this.containerEl.appendChild(stage);

        for (let pageNum = 1; pageNum <= this.pdf.numPages; pageNum += 1) {
            if (token !== this.renderToken) {
                return;
            }
            const page = pageNum === 1 ? firstPage : await this.pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            const canvas = document.createElement("canvas");
            canvas.className = "pdfjs-page";
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            canvas.setAttribute("aria-label", `Página ${pageNum} de ${this.pdf.numPages}`);
            const ctx = canvas.getContext("2d", { alpha: false });
            stage.appendChild(canvas);
            await page.render({ canvasContext: ctx, viewport }).promise;
        }

        this.onScaleChange?.(this.getScalePercent(), this.fitMode);
    }
}

/** Compatível com chamadas antigas. */
export async function renderEmbeddedPdf(containerEl, pdfUrl, options = {}) {
    const viewer = new PdfViewer();
    await viewer.open(containerEl, pdfUrl, options);
    return viewer;
}
