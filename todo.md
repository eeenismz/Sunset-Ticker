Linear: Sunset Ticker (https://linear.app/estains/project/sunset-ticker-376333b60e13)

# Sunset Ticker — todo

## Done
- [x] Phone Prev/Next redesign (option C from product-designer): quiet outlined Prev square with chevron, big gradient Next pill; fits 390x700 / 390x844 / 430x760 without scroll; M3 20/20, M4 35/35, M5 53/53 (2026-11-24)
- [x] Laptop loading screen (original art, slow pan, status per phase, rotating tips, min 1.2 s, reduced-motion safe) + PDF.js worker started at page load; M3 20/20, M4 35/35, M5 53/53 (2026-11-24)
- [x] Real iPhone pass by Ee on the live site (layout, pairing over mobile data, second phone refused, dot colours, Home Screen install, resume, wake lock, no zoom/bounce, That's a wrap): all passed; M2 and M5 complete (2026-11-24)
- [x] Redeploy + cache headers: live build v=20261124161732, sw.js `no-cache` + Cloudflare DYNAMIC, manifest application/manifest+json + no-cache, other apps on the domain still 200 (2026-11-24)
- [x] iPhone layout fix (WebKit): grid cells and Next-up preview sized by padding instead of aspect-ratio, main view rows don't shrink, current slide fills the leftover height; M3 20/20, M4 35/35, M5 53/53, no page scroll at 390x700 / 390x844 / 430x760 (2026-11-24)
- [x] Real-Firebase test pass: rules 42/42 (REST, 3 users), end-to-end laptop + 2 phones in separate profiles 20/20; fixed roomIndex query rule (endAt only matches exactly) and root multi-path updates in db.js; Firebase config kept out of git (2026-11-24)
- [x] Firebase project `sunset-ticker` (RTDB Singapore, Anonymous Auth, estains-tech.com authorized), config filled, rules pasted (2026-11-24)
- [x] Autopilot review (M3–M5): stale phone taps (>10 s) dropped after reconnect, cmds `at <= now` in rules, phone timer tick only while paired; pushed (2026-11-24)
- [x] M5 code: manifest + icons, versioned service worker (/remote/ only), gesture lock, phone wake lock, auto-resume on return, "That's a wrap" screen; QA 53/53 + M4 35/35 + M3 19/19 locally (2026-11-24)
- [x] M4 code: laser pointer (150 ms hold, ~15/s), black screen on/off from phone synced with B, count-up timer with confirm reset; QA 35/35 + M3 19/19 locally (2026-11-24)
- [x] M3 code: rules for state/cmds/thumbs/timer/laser, command queue, thumbnails (wide60 = 220 KB), phone main view + swipe + grid; QA 19/19 locally (2026-11-24)
- [x] M2 code: rooms, QR pairing, one-phone lock, R release, heartbeats + status dots, idle/stale cleanup, phone join/Showtime/Disconnect; QA 10/10 locally, review fixes applied (2026-11-23)
- [x] Full screen hint shows whenever the slide isn't full screen, also after Esc, and lists the slide keys (→ ← PgUp PgDn Space, B) (2026-11-23)
- [x] Theme mockups approved (1a plain phone main view, 2a glowing dot, 3a dark ink buttons); laptop start screen, hint pill, neon dot, favicon built (2026-11-23)
- [x] M1 laptop viewer: QA passed (keys, clamping, black, letterbox 16:9/4:3/A4, retina, bad file), review fixes applied (2026-11-23)
- [x] Read v1 spec, list risks and open questions, propose structure, data shape and milestones (2026-11-23)

## In Progress

## Pending

### M1 ✅ (2026-11-23) — Laptop renders a local PDF full screen, keyboard only (no Firebase)
- [x] Project skeleton: `src/`, `build.sh` (copy src → dist), `.gitignore`
- [x] `/view`: pick a PDF, render with PDF.js (CDN ES module), fit to screen with black bars
- [x] Re-render on resize at devicePixelRatio; pre-render next page so flips are instant
- [x] Keys (always work, even with no phone): ←/→, ↑/↓, PageUp/PageDown, Space, Home/End, B (black), F (full screen)
- [x] Black screen: pure black with a short smooth fade in/out
- [x] Full screen button (needs a click: browsers block full screen without one), cursor hidden
- [x] Screen Wake Lock on the laptop so it never dims mid-sermon
- Done check: 60-page PDF opens, flips with keyboard and a Bluetooth clicker, B toggles black, cursor hidden, no UI visible, 4:3 and 16:9 window both letterbox correctly

### M2 ✅ (2026-11-24) — Room, pairing, status dot on both sides
- [x] Firebase project (Realtime Database in Singapore + Anonymous Auth), `src/shared/firebase-config.js` filled (gitignored), estains-tech.com in Auth authorized domains (2026-11-24)
- [x] `database.rules.json` (room lock to first phone, size limits, stale-room delete) — written and reviewed, not yet pasted into the console
- [x] Rules pasted in the console + real-Firebase test pass (claim on a held room, stale delete by a 2nd laptop, roomIndex query, pairing) (2026-11-24)
- [x] Laptop: create 6-digit room, show QR + code, hide them when the phone pairs ("Connected" moment ~2 s, "Start without phone", slide keys skip pairing)
- [x] Phone `/remote`: join by QR link or typed 6-digit code; room locks to that phone (one device at a time); rejoins after reload
- [x] Show which device is connected; a second phone sees "In use by <device>" and is refused
- [x] Heartbeat every 2 s each side; dot grey / green / yellow (>3.5 s) / red (>10 s)
- [x] Lazy cleanup of rooms idle > 2 h when a new room is created; laptop deletes its room on close or after 2 h idle; phone "Disconnect" releases the lock
- [x] R key on the laptop releases the phone and shows the QR again (backup phone)
- [x] First HTTPS deploy to the droplet at estains-tech.com/apps/sunset-ticker/ (FTP, build v=20261124140028, checked with curl) (2026-11-24)
- [x] Local Firebase stand-in (`?fakedb`, src/ only, never in dist/) so pairing is testable without the Firebase project
- Done check: pair from iPhone over mobile data; second phone is refused; turn phone Wi-Fi/data off → yellow then red within ~10 s; back on → green; room gone from the database after End session

### M3 ✅ (2026-11-24) — Next / prev / goto + thumbnail grid
- [x] Extend database.rules.json for state / cmds / thumbs / timer / laser (`$other` blocks new paths)
- [x] Re-paste database.rules.json in the console (2026-11-24)
- [x] Phone commands must count as laptop activity (else the 2 h idle end kills a live session)
- [x] Laptop renders ~15 KB JPEG thumbnails and pushes them progressively
- [x] Command queue (phone pushes, laptop applies in order and removes); laptop owns `state.page`
- [x] Phone main view: current page, next-page preview, page X of Y, big Next/Prev, swipe
- [x] Thumbnail grid, current page highlighted, tap to jump
- Done check: 5 fast taps = 5 pages (none lost); keyboard flips on laptop update the phone; 60-page PDF ≈ 1 MB of thumbnails

### M4 ✅ (2026-11-24) — Laser pointer, black screen, timer
- [x] Hold-and-drag on the current page preview → red dot on the laptop (throttled ~15/s, normalized 0–1 coords)
- [x] Black screen toggle on phone, synced with the B key
- [x] Timer counts up, starts on the first Next (phone or keyboard); start time kept in the room so a phone reload keeps it
- [x] Reset timer button on the phone, with a confirm step
- [x] Re-paste database.rules.json in the console (adds cmd types resetTimer, cmd field on) (2026-11-24)
- Done check: dot follows the finger with acceptable lag over mobile data and disappears on release; black screen works from both sides and stays in sync

### M5 ✅ (2026-11-24) — PWA install, gesture lock, wake lock, auto-resume
- [x] Manifest (scope `/remote/`), service worker caching the app shell, iOS meta tags + icons
- [x] Gesture lock: no zoom, no double-tap zoom, no bounce, no selection, no long-press menu (grid still scrolls)
- [x] Wake Lock on the phone, re-requested on every return to the app
- [x] Auto-resume: room code saved locally; on return or reload, rejoin and land on the laptop's current page
- Done check: installed PWA on iPhone survives app switch, lock/unlock and being killed, rejoining without a rescan; screen stays on for 10+ min; no gesture zooms or bounces

- [x] Real iPhone pass after deploy (install, wake lock 10+ min, app kill → rejoin, pinch/bounce) — Ee: all passed (2026-11-24)
- [x] Deploy: nginx `no-cache` for remote/sw.js + manifest.webmanifest, manifest served as application/manifest+json, Cloudflare Cache Rule bypasses sw.js; checked with curl (2026-11-24)

### Theme — Neon sunset (original art only), moved before M2 on 2026-11-23
- [x] Theme tokens, self-hosted display font, split-panel start screen with original sunset art (SVG/CSS)
- [x] QR card + "Connected" moment, phone join / In use / Showtime / Disconnect screens (M2)
- [x] Phone main controls + thumbnail grid styling (with M3)
- [x] Neon status dot, "Showtime" / "That's a wrap" moments (phone only)
- [x] App icon: sun setting behind a single slide (PWA icon sizes with M5)
- Done check: projector slides untouched; no third-party logos or artwork; looks right on iPhone and laptop

### Later (from review, not urgent)
- [ ] Tests: the M1 harness (tests/run.sh) now stops on the pairing screen because dist/ has the real Firebase config; run it against src/ with ?fakedb or skip pairing
- [ ] Phone: a code typed before Firebase finishes connecting shows "Can't reach the connection service"; wait for the connection instead (QR links already wait)
- [ ] Optional: restrict the Firebase browser API key to estains-tech.com + localhost:8888 (Google Cloud → Credentials)
- [ ] Rules: require `roomIndex/$code` when a room is created, so rooms made outside the app still get cleaned (needs write order check with real Firebase)
- [ ] If flips feel slow at rehearsal on big decks: pause thumbnail rendering while a key is held

## Open questions
- [x] Black screen: pure black, smooth fade (2026-11-23)
- [x] Timer: counts up from the first Next, reset button with confirm (2026-11-23)
- [x] Laptop status dot: always on (2026-11-23)
- [x] Hosting: droplet, estains-tech.com/apps/sunset-ticker/ (2026-11-23)
- [x] 2-hour cleanup: lazy only (2026-11-23)
- [x] Laptop reload: re-pick the PDF, nothing stored on the laptop (2026-11-23)
- [x] One phone at a time, show which device is connected (2026-11-23)
- [x] Device name: auto "iPhone · iOS 18" (2026-11-23)
- [x] Laptop shows "Connected: <device>" ~2 s on the start screen, then slides only; second phone sees "In use by <device>" (2026-11-23)
- [x] Switch phones: "Disconnect" on the phone + R key on the laptop (2026-11-23)
- [x] Timer reset: back to 0:00, waits for the next Next (2026-11-23)
- [x] Firebase project: new one (region Singapore) created by Ee in the console (2026-11-24)
