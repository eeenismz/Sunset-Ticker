# Sunset Ticker

A church laptop shows a PDF full screen; an iPhone PWA controls it as a clicker, through Firebase Realtime Database.

- **Laptop:** open `/view/` in Chrome or Edge, pick the PDF, scan the QR (or type the 6-digit code) on the phone.
- **Phone:** `/remote/`, added to the Home Screen. Next/prev, swipe, thumbnail grid (tap to jump),
  laser pointer (press and hold on the slide, then drag), black screen, count-up timer (starts on the first Next).
- One phone at a time. A second phone sees "In use by <device>". Press **R** on the laptop to release it.
- The PDF never leaves the laptop. Only low-res page thumbnails go through the relay and are deleted when the session ends or after 2 hours idle.

Full spec: `Sunset Ticker v1 Spec.md`. Tasks: `todo.md`.

## Setup

- Source lives in `src/`. Run `./build.sh` to copy it into `dist/` (the deploy folder) with a fresh cache-busting version stamp. No build tools needed.
- Local test: http://localhost:8888/workplaces/sunset-ticker/dist/view/ (MAMP).
- Local test without Firebase: add `?fakedb` to the `src/` URLs (laptop and phone in the same browser). Never shipped in `dist/`.
- Automated tests: `tests/m3-steps.js`, `m4-steps.js` and `m5-steps.js` run with `tests/m2-cdp.mjs` on Node 24.
- Hosting: the droplet at estains-tech.com/apps/sunset-ticker/ (upload `dist/`).

### Firebase (one-time)
1. Create a project with a Realtime Database (Singapore) and Anonymous sign-in turned on.
2. Fill in `src/shared/firebase-config.js` from the web app config (not secret), then run `./build.sh`.
3. Paste `database.rules.json` into Realtime Database → Rules. Re-paste it whenever it changes.
4. Add `estains-tech.com` to Authentication → Authorized domains.

Without the config, the laptop still works keyboard-only.

### Deploy notes
- nginx: `Cache-Control: no-cache` for `remote/sw.js` and `remote/manifest.webmanifest`; serve `.webmanifest` as `application/manifest+json`.
- Phone app features (install, wake lock, service worker) need HTTPS, so test on the deployed URL, not on MAMP over the LAN.

## Laptop keys

| Key | Action |
| --- | --- |
| → ↓ PageDown Space | Next slide |
| ← ↑ PageUp Shift+Space | Previous slide |
| Home / End | First / last slide |
| B or . | Black screen on/off |
| F | Full screen on/off |
| R | Release the phone (shows the QR again) |

## Before a service

- Laptop display set to **Duplicate**; turn on Focus Assist / Do Not Disturb so OS popups don't reach the projector.
- Open `/view/`, pick the PDF, click full screen **before** people arrive.
- Keyboard and Bluetooth clickers always work, even if the phone disconnects.
