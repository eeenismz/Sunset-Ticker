// Laptop viewer: shows the PDF full screen and reacts to the keyboard / Bluetooth clickers.

const $ = (id) => document.getElementById(id);
const startEl = $('start');
const stageEl = $('stage');
const slideEl = $('slide');
const blackEl = $('black');
const hintEl = $('hint');
const msgEl = $('msg');
const fileEl = $('file');

// The PDF engine comes from the CDN. Load it dynamically so that if the internet
// or the CDN is down, the page still runs and can say so (a static import would
// silently stop the whole script).
const enginePromise = import('./pdf-render.js?v=__V__');
enginePromise.catch(() => {
  msgEl.textContent = "Can't load the PDF engine. This page needs internet.";
});

let engine = null;     // the pdf-render.js module once loaded
let pdf = null;        // the open PDF document
let page = 1;          // current page (1-based)
let black = false;     // black screen on/off
let gen = 0;           // bumped on resize so renders made for the old size are ignored
const cache = new Map(); // page number -> render job, only pages near the current one

// ---------- Opening the PDF ----------
fileEl.addEventListener('change', async () => {
  const file = fileEl.files[0];
  if (!file) return;
  msgEl.textContent = 'Opening…';
  try {
    engine = await enginePromise;
  } catch (err) {
    msgEl.textContent = "Can't load the PDF engine. This page needs internet.";
    fileEl.value = '';
    return;
  }
  try {
    pdf = await engine.openPdf(file);
  } catch (err) {
    msgEl.textContent = err && err.name === 'PasswordException'
      ? 'This PDF is password protected. Save a copy without a password and try again.'
      : 'Could not open that file. Please pick a PDF.';
    fileEl.value = '';
    return;
  }
  msgEl.textContent = '';
  startEl.hidden = true;
  stageEl.hidden = false;
  goTo(1);
  keepAwake();
});

// ---------- Render cache ----------
function getJob(n) {
  if (!cache.has(n)) {
    const job = engine.renderPage(pdf, n, window.innerWidth, window.innerHeight);
    job.promise.catch((err) => {
      if (job.cancelled) return;
      console.error('Page ' + n + ' failed to render', err);
      if (cache.get(n) === job) cache.delete(n); // retried on the next visit
    });
    cache.set(n, job);
  }
  return cache.get(n);
}

// Drop a page from the cache: stop its render and free its pixels,
// unless that canvas is the one on screen right now.
function evict(n) {
  const job = cache.get(n);
  cache.delete(n);
  job.cancel();
  if (job.canvas && job.canvas !== slideEl.firstChild) engine.freeCanvas(job.canvas);
}

function isCached(canvas) {
  for (const job of cache.values()) if (job.canvas === canvas) return true;
  return false;
}

// ---------- Showing pages ----------
// prefetch = false while a key is held down, so auto-repeat doesn't start dozens of renders.
function goTo(n, prefetch = true) {
  if (!pdf) return;
  n = Math.max(1, Math.min(pdf.numPages, n));
  page = n;
  const myGen = gen;

  // Keep the old slide on screen until the new one is ready (no blank flash),
  // and drop the result if the presenter already moved on or the window resized.
  getJob(n).promise.then((canvas) => {
    if (n !== page || myGen !== gen) return;
    const old = slideEl.firstChild;
    slideEl.replaceChildren(canvas);
    if (old && old !== canvas && !isCached(old)) engine.freeCanvas(old);
  }).catch(() => {});

  // Pre-render the neighbours so the next flip is instant.
  if (prefetch) {
    if (n < pdf.numPages) getJob(n + 1);
    if (n > 1) getJob(n - 1);
  }

  // Free memory: forget pages more than 2 away.
  for (const k of [...cache.keys()]) {
    if (Math.abs(k - n) > 2) evict(k);
  }
}

// Window size changes (full screen on/off, projector resolution): render again at the new size.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!pdf) return;
    gen++;
    for (const k of [...cache.keys()]) evict(k);
    goTo(page);
  }, 150);
});

// ---------- Black screen ----------
// Changing slides while black keeps the screen black, so the next slide
// can be lined up during a prayer. Only B / "." (or the phone, later) turns it off.
function toggleBlack() {
  black = !black;
  blackEl.classList.toggle('on', black);
}

// ---------- Full screen ----------
// Browsers only allow full screen right after a click or key press, so it can't start by itself.
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
stageEl.addEventListener('click', () => {
  if (!document.fullscreenElement) toggleFullscreen();
});

// The hint shows whenever the slide is not full screen (also after Esc), and hides in full screen.
document.addEventListener('fullscreenchange', () => {
  hintEl.hidden = !!document.fullscreenElement;
});

// ---------- Keyboard and Bluetooth clickers ----------
// Clickers send the same keys as a keyboard (arrows / PageUp / PageDown, some send "." or B for black).
const NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
const PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp'];

document.addEventListener('keydown', (e) => {
  if (!pdf || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const prefetch = !e.repeat;
  let handled = true;

  if (k === ' ' && e.shiftKey) goTo(page - 1, prefetch);
  else if (NEXT_KEYS.includes(k)) goTo(page + 1, prefetch);
  else if (PREV_KEYS.includes(k)) goTo(page - 1, prefetch);
  else if (k === 'Home') goTo(1);
  else if (k === 'End') goTo(pdf.numPages);
  else if (k === 'b' || k === 'B' || k === '.') toggleBlack();
  else if (k === 'f' || k === 'F') toggleFullscreen();
  else handled = false;

  if (handled) {
    e.preventDefault(); // stop Space / arrows from scrolling
  }
});

// After a held key is released, pre-render the neighbours that were skipped.
document.addEventListener('keyup', () => {
  if (pdf) goTo(page);
});

// ---------- Keep the laptop screen awake ----------
// The wake lock is dropped when the tab is hidden, so ask again when it comes back.
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    // Not allowed (e.g. battery saver): the slides still work, the screen may just dim.
  }
}
document.addEventListener('visibilitychange', () => {
  if (pdf && document.visibilityState === 'visible') keepAwake();
});
