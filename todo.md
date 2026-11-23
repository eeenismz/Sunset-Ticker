Linear: Sunset Ticker (https://linear.app/estains/project/sunset-ticker-376333b60e13)

# Sunset Ticker — todo

## Done
- [x] M1 laptop viewer: QA passed (keys, clamping, black, letterbox 16:9/4:3/A4, retina, bad file), review fixes applied (2026-11-23)
- [x] Read v1 spec, list risks and open questions, propose structure, data shape and milestones (2026-11-23)

## In Progress
- [ ] M2 — waiting for the Firebase project (Ee creates it in the console)

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

### M2 — Room, pairing, status dot on both sides
- [ ] Firebase project (Realtime Database + Anonymous Auth), config in `src/shared/firebase.js`
- [ ] `database.rules.json` (room lock to first phone, size limits, stale-room delete)
- [ ] Laptop: create 6-digit room, show QR + code, hide them when the phone pairs
- [ ] Phone `/remote`: join by QR link or typed 6-digit code; room locks to that phone (one device at a time)
- [ ] Show which device is connected; a second phone sees "In use by <device>" and is refused
- [ ] Heartbeat every 2 s each side; dot grey / green / yellow (>3 s) / red (>10 s)
- [ ] Lazy cleanup of rooms idle > 2 h when a new room is created; "End session" deletes the room
- [ ] Laptop key to release the remote and show the QR again (backup phone)
- [ ] First HTTPS deploy to the droplet at estains-tech.com/apps/sunset-ticker/ (needed for real iPhone tests from here on)
- Done check: pair from iPhone over mobile data; second phone is refused; turn phone Wi-Fi/data off → yellow then red within ~10 s; back on → green; room gone from the database after End session

### M3 — Next / prev / goto + thumbnail grid
- [ ] Laptop renders ~15 KB JPEG thumbnails and pushes them progressively
- [ ] Command queue (phone pushes, laptop applies in order and removes); laptop owns `state.page`
- [ ] Phone main view: current page, next-page preview, page X of Y, big Next/Prev, swipe
- [ ] Thumbnail grid, current page highlighted, tap to jump
- Done check: 5 fast taps = 5 pages (none lost); keyboard flips on laptop update the phone; 60-page PDF ≈ 1 MB of thumbnails

### M4 — Laser pointer, black screen, timer
- [ ] Hold-and-drag on the current page preview → red dot on the laptop (throttled ~15/s, normalized 0–1 coords)
- [ ] Black screen toggle on phone, synced with the B key
- [ ] Timer counts up, starts on the first Next (phone or keyboard); start time kept in the room so a phone reload keeps it
- [ ] Reset timer button on the phone, with a confirm step
- Done check: dot follows the finger with acceptable lag over mobile data and disappears on release; black screen works from both sides and stays in sync

### M5 — PWA install, gesture lock, wake lock, auto-resume
- [ ] Manifest (scope `/remote/`), service worker caching the app shell, iOS meta tags + icons
- [ ] Gesture lock: no zoom, no double-tap zoom, no bounce, no selection, no long-press menu (grid still scrolls)
- [ ] Wake Lock on the phone, re-requested on every return to the app
- [ ] Auto-resume: room code saved locally; on return or reload, rejoin and land on the laptop's current page
- Done check: installed PWA on iPhone survives app switch, lock/unlock and being killed, rejoining without a rescan; screen stays on for 10+ min; no gesture zooms or bounces

### M6 — Neon sunset theme (original art only)
- [ ] Theme tokens, self-hosted display font, split-panel start screen with original sunset art (SVG/CSS)
- [ ] Neon status dot, "Showtime" / "That's a wrap" moments (phone only)
- [ ] App icon: sun setting behind a single slide
- Done check: projector slides untouched; no third-party logos or artwork; looks right on iPhone and laptop

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
- [ ] Firebase project: new one (region Singapore) created by Ee in the console (needed for M2)
