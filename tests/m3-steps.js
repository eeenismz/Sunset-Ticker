// M3 test steps. Runs inside tests/m3-harness.html (see the header there). Returns a JSON report
// with pass/fail for each check and the total thumbnail size for tests/fixtures/wide60.pdf.
const report = {};
const ok = (name, cond, extra) => { report[name] = { pass: !!cond, ...(extra === undefined ? {} : { value: extra }) }; return !!cond; };
const waitFor = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await T.sleep(100); }
  return null;
};
const phone = (id) => doc(id);   // phone document (the iframe)
const lapState = (code) => ((T.db().rooms || {})[code] || {}).state || {};

// 1. Laptop opens the PDF and gets a room code.
T.pickPdf('wide60');
const code = await waitFor(() => T.roomCode().length === 6 && T.roomCode());
ok('room code shown', code, code);

// 2. Phone types the code and gets to the main view (Showtime lasts 2.5 s).
T.openPhone('phA');
await T.sleep(800);
T.typeCode('phA', code);
const mainUp = await waitFor(() => T.visible('phA', 'mainScreen'));
ok('phone reaches main view', mainUp);
const labelReady = await waitFor(() => T.text('phA', 'pageLabel') === 'Page 1 of 60');
ok('phone shows Page 1 of 60', labelReady, T.text('phA', 'pageLabel'));

// 3. Five fast Next taps in one go: every tap must count (5 pages, none lost).
for (let i = 0; i < 5; i++) phone('phA').getElementById('nextBtn').click();
const afterTaps = await waitFor(() => lapState(code).page === 6);
ok('5 fast Next taps = page 6', afterTaps, lapState(code).page);
await T.sleep(1500); // give any extra (lost or duplicated) command time to land
ok('page stays 6 after 1.5 s (no double count)', lapState(code).page === 6, lapState(code).page);
const queueEmpty = await waitFor(() => !((T.db().rooms || {})[code] || {}).cmds);
ok('command queue emptied by laptop', queueEmpty);
const phoneLabel = await waitFor(() => T.text('phA', 'pageLabel') === 'Page 6 of 60');
ok('phone shows Page 6 of 60 after taps', phoneLabel, T.text('phA', 'pageLabel'));

// 4. Keyboard flip on the laptop updates the phone.
T.key('ArrowRight');
const kbPhone = await waitFor(() => T.text('phA', 'pageLabel') === 'Page 7 of 60');
ok('keyboard flip updates phone to page 7', kbPhone, T.text('phA', 'pageLabel'));

// 5. Prev from the phone.
phone('phA').getElementById('prevBtn').click();
ok('Prev from phone = page 6', await waitFor(() => lapState(code).page === 6), lapState(code).page);

// 6. Grid: open, check highlight, tap page 20 to jump.
phone('phA').getElementById('gridBtn').click();
const gridUp = await waitFor(() => T.visible('phA', 'gridScreen') && doc('phA').querySelectorAll('.thumb-cell').length === 60);
ok('grid shows 60 cells', gridUp);
const cur = doc('phA').querySelector('.thumb-cell.current');
ok('grid highlights page 6', cur && cur.textContent.trim() === '6', cur && cur.textContent.trim());
doc('phA').querySelectorAll('.thumb-cell')[19].click();
ok('grid tap 20 jumps laptop to page 20', await waitFor(() => lapState(code).page === 20), lapState(code).page);
ok('phone back on main view after jump', await waitFor(() => T.visible('phA', 'mainScreen') && T.text('phA', 'pageLabel') === 'Page 20 of 60'), T.text('phA', 'pageLabel'));

// 7. Thumbnails: all 60 pushed, each a JPEG data URL under the cap; report total bytes.
const allThumbs = await waitFor(() => Object.keys(((T.db().rooms || {})[code] || {}).thumbs || {}).length === 60, 60000);
ok('all 60 thumbnails pushed', allThumbs);
const thumbs = Object.values(((T.db().rooms || {})[code] || {}).thumbs || {});
const bytes = thumbs.reduce((sum, u) => sum + Math.floor((u.length - 'data:image/jpeg;base64,'.length) * 3 / 4), 0);
const maxChars = Math.max(0, ...thumbs.map((u) => u.length));
ok('every thumbnail is a JPEG data URL under 40000 chars', thumbs.length && thumbs.every((u) => u.startsWith('data:image/jpeg;base64,') && u.length <= 40000), { maxChars });
report.thumbTotalBytes = { value: bytes, kb: Math.round(bytes / 1024), avgBytes: Math.round(bytes / thumbs.length) };
ok('phone shows the current thumbnail', await waitFor(() => { const i = phone('phA').getElementById('nowImg'); return !i.hidden && i.src.startsWith('data:image/jpeg'); }));

// 8. Phone reload mid-session: rejoin lands on the current page with thumbnails.
T.openPhone('phA'); // same uid, fresh page load; the room code was saved in localStorage
const reLabel = await waitFor(() => T.visible('phA', 'mainScreen') && T.text('phA', 'pageLabel') === 'Page 20 of 60');
ok('phone reload shows Page 20 of 60', reLabel, T.text('phA', 'pageLabel'));
ok('phone reload shows thumbnail again', await waitFor(() => { const i = phone('phA').getElementById('nowImg'); return !i.hidden && i.src.startsWith('data:image/jpeg'); }));

// 9. Laptop R key (release) keeps the room; the phone leaves.
T.key('r');
ok('R release: phone back on join screen', await waitFor(() => T.visible('phA', 'joinScreen')));

const passed = Object.values(report).filter((r) => r.pass === true).length;
const total = Object.values(report).filter((r) => typeof r.pass === 'boolean').length;
report.summary = { passed, total };
return report;
