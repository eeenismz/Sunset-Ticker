// PDF loading and page rendering with PDF.js (ES module from the CDN).
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';

// PDF.js wraps a cross-origin worker URL in a same-origin blob itself, so a CDN URL works here.
pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'build/pdf.worker.min.mjs';

// Open a PDF picked from the laptop. The bytes stay in memory, nothing is uploaded.
// cMaps + standard fonts are needed for Thai/Japanese text and PDFs without embedded fonts;
// without them PDF.js only warns in the console and the text goes missing.
export async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjsLib.getDocument({
    data,
    cMapUrl: CDN + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: CDN + 'standard_fonts/',
  }).promise;
}

// Start rendering one page as large as fits inside boxW x boxH (CSS pixels), keeping its
// aspect ratio. The canvas has devicePixelRatio times more pixels, so text stays sharp.
// Returns a job: { promise (resolves to the canvas), canvas, cancel() }.
export function renderPage(pdf, num, boxW, boxH) {
  const job = { canvas: null, task: null, cancelled: false };

  job.promise = (async () => {
    const page = await pdf.getPage(num);
    if (job.cancelled) throw new Error('cancelled');

    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(boxW / base.width, boxH / base.height);
    const dpr = window.devicePixelRatio || 1;

    // Make the leftover space (box - slide) an even number of pixels, so the
    // black bars on each side are whole pixels and slide edges stay crisp.
    const snap = (px, box) => ((box - px) % 2 ? px - 1 : px);
    const cssW = snap(Math.floor(base.width * fit), Math.floor(boxW));
    const cssH = snap(Math.floor(base.height * fit), Math.floor(boxH));
    const viewport = page.getViewport({ scale: fit * dpr }); // pixels to draw; CSS size differs by at most 1px

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    job.canvas = canvas;

    job.task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await job.task.promise;
    return canvas;
  })();

  // Stop the render (if still running). The caller frees the canvas.
  job.cancel = () => {
    job.cancelled = true;
    if (job.task) job.task.cancel();
  };
  return job;
}

// Release a canvas's pixel memory right away (Safari otherwise keeps it for a while).
export function freeCanvas(canvas) {
  if (canvas) canvas.width = canvas.height = 0;
}

// Small JPEG preview of one page for the phone: `width` CSS px wide (about 15 KB at 320 px),
// returned as a data URL. The page is painted on white first, since JPEG has no transparency.
export async function renderThumb(pdf, num, width, quality) {
  const page = await pdf.getPage(num);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    page.cleanup();                 // free PDF.js's per-page data right away
    canvas.width = canvas.height = 0; // and the canvas pixels
  }
}
