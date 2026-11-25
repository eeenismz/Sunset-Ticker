// Regression steps: picking a new PDF destroys the old PDF.js document (view.js openFile).
// Runs in tests/m3-harness.html:
//   PATH=<node24>/bin node tests/m2-cdp.mjs http://localhost:8888/workplaces/sunset-ticker/tests/m3-harness.html tests/m6-steps.js
// Fixtures: wide60 = 60 pages, three = 3 pages, a4 = 60 pages. Console must stay empty (see CONSOLE: [] in the output).
const report = {};
const ok = (name, cond, extra) => { report[name] = { pass: !!cond, ...(extra === undefined ? {} : { value: extra }) }; return !!cond; };
const T0 = Date.now();
const waitFor = async (fn, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && Date.now() - T0 < 105000) { const v = await fn(); if (v) return v; await T.sleep(100); }
  return null;
};
const lap = () => doc('lap');
const room = (code) => (T.db().rooms || {})[code] || {};
let requireVisible = true; // false while the pairing screen hides the stage
const slideOk = () => { const c = lap().getElementById('slide').querySelector('canvas'); return c && c.width > 0 && c.height > 0 && (!requireVisible || c.getBoundingClientRect().width > 0); };
const stageUp = () => !lap().getElementById('stage').hidden;

// Pick a PDF and check everything that must follow. paired = a phone is in the room.
async function pick(name, pages, code, label) {
  const before = lap().getElementById('fileName').textContent;
  requireVisible = !!code;
  await T.pickPdf(name);
  ok(label + ': file name updated', await waitFor(() => lap().getElementById('fileName').textContent === name + '.pdf' && (code ? stageUp() : true)), before);
  ok(label + ': slide canvas renders', await waitFor(slideOk), (() => { const c = lap().getElementById('slide').querySelector('canvas'); return c ? c.width + 'x' + c.height : 'none'; })());
  ok(label + ': laptop says ' + pages + ' pages', lap().getElementById('filePages').textContent.startsWith(pages + ' page'), lap().getElementById('filePages').textContent);
  if (code) {
    ok(label + ': meta.pageCount = ' + pages, await waitFor(() => room(code).meta && room(code).meta.pageCount === pages), room(code).meta);
    ok(label + ': phone shows Page 1 of ' + pages, await waitFor(() => T.text('phA', 'pageLabel') === 'Page 1 of ' + pages), T.text('phA', 'pageLabel'));
    ok(label + ': thumbs rewritten, exactly ' + pages, await waitFor(() => Object.keys(room(code).thumbs || {}).length === pages, 20000), Object.keys(room(code).thumbs || {}).length);
    await T.sleep(1000); // a stale loop from the old PDF would add or break entries by now
    const th = Object.keys(room(code).thumbs || {}).map(Number);
    ok(label + ': thumbs are 1..' + pages + ' only', th.length === pages && th.every((n) => n >= 1 && n <= pages), th.length);
  }
  // Keyboard flip still works (page 1 -> 2), then back (only when paired: unpaired shows the pairing screen).
  T.key('ArrowRight');
  if (code) ok(label + ': keyboard Right -> page 2', await waitFor(() => room(code).state && room(code).state.page === 2 && slideOk()));
  if (code) ok(label + ': phone follows to Page 2 of ' + pages, await waitFor(() => T.text('phA', 'pageLabel') === 'Page 2 of ' + pages), T.text('phA', 'pageLabel'));
  T.key('ArrowLeft');
  await T.sleep(300);
}

// A. Not paired (room exists, no phone joined; pairing screen is up): two picks in a row.
await T.pickPdf('wide60');
await waitFor(() => T.roomCode().length === 6 && T.roomCode());
await waitFor(() => !lap().getElementById('stage').hidden || true, 100);
// Not paired yet: pick again twice.
await pick('three', 3, null, 'unpaired pick 2 (three)');
await pick('wide60', 60, null, 'unpaired pick 3 (wide60)');

// B. Paired path.
const code = T.roomCode();
ok('room code present', code.length === 6, code);
T.openPhone('phA');
await T.sleep(800);
T.typeCode('phA', code);
ok('phone reaches main view', await waitFor(() => T.visible('phA', 'mainScreen')));
await waitFor(() => T.text('phA', 'pageLabel') === 'Page 1 of 60');
await waitFor(() => Object.keys(room(code).thumbs || {}).length === 60, 20000);
await pick('three', 3, code, 'paired -> three');
await pick('a4', 60, code, 'paired -> a4');
await pick('wide60', 60, code, 'paired -> wide60');

// C. Pick a different PDF while thumbnails of the old one are still being rendered.
await T.pickPdf('a4');
await T.sleep(400);
await pick('three', 3, code, 'mid-thumb-loop -> three');
// Same file twice in a row.
await pick('three', 3, code, 'same pdf again');

const passed = Object.values(report).filter((r) => r.pass === true).length;
const total = Object.values(report).filter((r) => typeof r.pass === 'boolean').length;
report.summary = { passed, total };
return report;
