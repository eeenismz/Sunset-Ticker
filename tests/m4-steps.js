// M4 test steps. Runs inside tests/m3-harness.html (same harness and fake relay as M3; see its header):
// PATH=<node24>/bin node tests/m2-cdp.mjs http://localhost:8888/workplaces/sunset-ticker/tests/m3-harness.html tests/m4-steps.js
// Covers: laser dot (hold and drag on the phone, gone on release), black screen from the phone and B,
// the timer (starts on the first Next, survives a phone reload, reset with a confirm step).
const report = {};
const ok = (name, cond, extra) => { report[name] = { pass: !!cond, ...(extra === undefined ? {} : { value: extra }) }; return !!cond; };
const waitFor = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await T.sleep(100); }
  return null;
};
const room = (code) => ((T.db().rooms || {})[code] || {});
const lapState = (code) => room(code).state || {};
const lapEl = (id) => doc('lap').getElementById(id);
const phEl = (id) => doc('phA').getElementById(id);
const secs = (t) => t.split(':').map(Number).reduce((a, v) => a * 60 + v, 0);

// 1. Laptop opens the PDF; the phone pairs and shows the first slide.
T.pickPdf('wide60');
const code = await waitFor(() => T.roomCode().length === 6 && T.roomCode());
ok('room code shown', code, code);
T.openPhone('phA');
await T.sleep(800);
T.typeCode('phA', code);
ok('phone reaches main view', await waitFor(() => T.visible('phA', 'mainScreen')));
ok('phone shows Page 1 of 60', await waitFor(() => T.text('phA', 'pageLabel') === 'Page 1 of 60'), T.text('phA', 'pageLabel'));
ok('phone shows the current slide picture', await waitFor(() => { const i = phEl('nowImg'); return !i.hidden && i.complete && i.naturalWidth > 0; }));
ok('laptop presenting (slide canvas + stage visible)', await waitFor(() => lapEl('slide').querySelector('canvas') && !lapEl('stage').hidden));

// 2. Laser: hold on the phone's slide for 150 ms and drag. The laptop dot follows the finger.
const img = phEl('nowImg');
const box = img.getBoundingClientRect();
const sc = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
const imgLeft = box.left + (box.width - dw) / 2, imgTop = box.top + (box.height - dh) / 2;
const at = (fx, fy) => ({ clientX: imgLeft + fx * dw, clientY: imgTop + fy * dh });
const PE = doc('phA').defaultView.PointerEvent;
const pe = (type, p) => phEl('nowBox').dispatchEvent(new PE(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: p.clientX, clientY: p.clientY }));

pe('pointerdown', at(0.3, 0.4));
await T.sleep(250);                       // past the 150 ms hold: the laser starts
pe('pointermove', at(0.6, 0.4));
await T.sleep(300);
const cr = lapEl('slide').querySelector('canvas').getBoundingClientRect();
const dr = lapEl('laser').getBoundingClientRect();
const dotX = dr.left + dr.width / 2, dotY = dr.top + dr.height / 2;
ok('laser dot visible on the laptop during the drag', !lapEl('laser').hidden);
ok('laser dot sits at the dragged point (x 0.6, y 0.4 of the slide)',
  !lapEl('laser').hidden && Math.abs(dotX - (cr.left + 0.6 * cr.width)) < 3 && Math.abs(dotY - (cr.top + 0.4 * cr.height)) < 3,
  { dotX: Math.round(dotX), dotY: Math.round(dotY), wantX: Math.round(cr.left + 0.6 * cr.width), wantY: Math.round(cr.top + 0.4 * cr.height) });
const node = room(code).laser || {};
ok('laser node holds normalised 0..1 coordinates', Math.abs(node.x - 0.6) < 0.02 && Math.abs(node.y - 0.4) < 0.02, node);
ok('phone shows its own laser dot while drawing', phEl('nowBox').classList.contains('laser-on'));
ok('laser drag does not change the page', lapState(code).page === 1, lapState(code).page);
pe('pointerup', at(0.6, 0.4));
ok('laser dot gone on the laptop after release', await waitFor(() => lapEl('laser').hidden));
ok('laser node removed from the room after release', await waitFor(() => !room(code).laser));
await T.sleep(300);
ok('laser stays off after release (no late write)', !room(code).laser && lapEl('laser').hidden);

// A finger that moves before the hold ends is a swipe: no laser, no page change.
pe('pointerdown', at(0.5, 0.5));
pe('pointermove', at(0.2, 0.5));
await T.sleep(300);
ok('quick move is a swipe: no laser node', !room(code).laser && lapEl('laser').hidden);
pe('pointerup', at(0.2, 0.5));

// 3. Timer waits for the first Next.
ok('timer shows 0:00 before the first Next', T.text('phA', 'timer') === '0:00', T.text('phA', 'timer'));
ok('room has no timer start before the first Next', !(room(code).timer && room(code).timer.startAt));

// 4. Black screen from the phone; the phone button shows state.black.
phEl('blackBtn').click();
ok('phone black tap: laptop state.black is true', await waitFor(() => lapState(code).black === true), lapState(code).black);
ok('phone button shows on', await waitFor(() => T.text('phA', 'blackBtn') === 'Black screen: on'), T.text('phA', 'blackBtn'));
ok('laptop black screen is on', await waitFor(() => lapEl('black').classList.contains('on')));

// The first Next (keyboard) while black: the slide changes, the screen stays black, the timer starts.
T.key('ArrowRight');
ok('Next while black moves to page 2', await waitFor(() => lapState(code).page === 2), lapState(code).page);
ok('black stays on after a Next', lapState(code).black === true);
ok('first Next starts the timer (startAt set)', await waitFor(() => typeof (room(code).timer || {}).startAt === 'number'));
const startAt1 = (room(code).timer || {}).startAt;

// B on the laptop turns black off; the phone button follows.
T.key('b');
ok('B turns black off (laptop state)', await waitFor(() => lapState(code).black === false));
ok('phone button shows off after B', await waitFor(() => T.text('phA', 'blackBtn') === 'Black screen: off'), T.text('phA', 'blackBtn'));
ok('laptop black screen is off', !lapEl('black').classList.contains('on'));

// 5. Timer counts up.
await T.sleep(2300);
const t1 = T.text('phA', 'timer');
ok('phone timer counts up after the Next (2 to 3 s)', secs(t1) >= 2 && secs(t1) <= 3, t1);

// 6. Phone reload: the timer comes from the room, so the same start shows again.
T.openPhone('phA');
ok('phone reload: main view on page 2', await waitFor(() => T.visible('phA', 'mainScreen') && T.text('phA', 'pageLabel') === 'Page 2 of 60'));
const tReload = await waitFor(() => { const t = T.text('phA', 'timer'); return secs(t) >= 2 ? t : null; });
ok('phone reload keeps the same start and a running timer', (room(code).timer || {}).startAt === startAt1 && !!tReload, tReload);

// 7. Reset: asks first (in-page, no window.confirm); Keep does nothing; Reset goes to 0:00 and waits.
let nativeConfirm = false;
doc('phA').defaultView.confirm = () => { nativeConfirm = true; return true; };
phEl('resetBtn').click();
ok('reset asks first (confirm row shown, timer unchanged)', T.visible('phA', 'resetConfirm') && (room(code).timer || {}).startAt === startAt1);
phEl('resetNo').click();
ok('Keep closes the confirm and keeps the timer', !T.visible('phA', 'resetConfirm') && (room(code).timer || {}).startAt === startAt1);
phEl('resetBtn').click();
phEl('resetYes').click();
ok('reset: phone shows 0:00', await waitFor(() => T.text('phA', 'timer') === '0:00'), T.text('phA', 'timer'));
ok('reset: laptop clears startAt', await waitFor(() => !(room(code).timer && room(code).timer.startAt)));
await T.sleep(1500);
ok('timer stays 0:00 until the next Next', T.text('phA', 'timer') === '0:00' && !(room(code).timer && room(code).timer.startAt), T.text('phA', 'timer'));
ok('reset did not use window.confirm', !nativeConfirm);
phEl('nextBtn').click();
ok('next Next after reset starts the timer again', await waitFor(() => typeof (room(code).timer || {}).startAt === 'number'));

const passed = Object.values(report).filter((r) => r.pass === true).length;
const total = Object.values(report).filter((r) => typeof r.pass === 'boolean').length;
report.summary = { passed, total };
return report;
