# Sunset Ticker

A church laptop shows a PDF full screen; an iPhone PWA controls it as a clicker, through Firebase Realtime Database.

- **Laptop:** open `/view/` in Chrome or Edge, pick the PDF, scan the QR (or type the 6-digit code) on the phone.
- **Phone:** `/remote/`, added to the Home Screen. Next/prev, swipe, thumbnail grid, laser pointer, black screen, timer.
- The PDF never leaves the laptop. Only low-res page thumbnails go through the relay and are deleted when the session ends or after 2 hours idle.

Full spec: `Sunset Ticker v1 Spec.md`. Tasks: `todo.md`.

## Setup

- Source lives in `src/`. Run `./build.sh` to copy it into `dist/` (the deploy folder) with a fresh cache-busting version stamp. No build tools needed.
- Local test: http://localhost:8888/workplaces/sunset-ticker/dist/view/ (MAMP).
- Hosting: the droplet at estains-tech.com/apps/sunset-ticker/ (upload `dist/`).
- _Coming in M2:_ Firebase project config and database rules.

## Laptop keys

| Key | Action |
| --- | --- |
| → ↓ PageDown Space | Next slide |
| ← ↑ PageUp Shift+Space | Previous slide |
| Home / End | First / last slide |
| B or . | Black screen on/off |
| F | Full screen on/off |

## Before a service

- Laptop display set to **Duplicate**; turn on Focus Assist / Do Not Disturb so OS popups don't reach the projector.
- Open `/view/`, pick the PDF, click full screen **before** people arrive.
- Keyboard and Bluetooth clickers always work, even if the phone disconnects.
