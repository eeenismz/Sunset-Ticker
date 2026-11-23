# Sunset Ticker v1 Spec

Nov 22, 2026 · @Eeenismz

## Overview

Sunset Ticker is a web app that shows a PDF full screen on a laptop and lets an iPhone control it as a clicker. It is built for the church laptop: a borrowed machine, display set to Duplicate, so the projector shows exactly what the laptop shows.

- **Viewer:** a website opened in Chrome or Edge on the laptop. No install, no login.
- **Remote:** a PWA on the presenter's iPhone, added to the Home Screen. No native app.
- **Goal:** clean slides for the audience, full control and preview in the presenter's hand.

## Key decisions and constraints

| Topic | Decision | Why |
| --- | --- | --- |
| Laptop | Nothing installed, website only | Church laptop is shared, not ours |
| Display | Duplicate mode, so the laptop shows only clean slides | Audience sees the laptop screen |
| Network | Laptop uses church internet, phone uses its own mobile data | No shared hotspot |
| Relay | Cloud relay between the two devices | Devices are on different networks |
| Remote | iPhone PWA, no native app | Personal preference, no App Store |
| PDF | Loaded from the laptop each session, never uploaded whole | Church documents stay local |
| Thumbnails | Low-res page images go through the relay, deleted at session end | Needed for preview and jump to page |

## Laptop viewer

The laptop shows only the slide plus one small status dot, because the audience sees everything on it.

1. **Start screen:** pick the PDF, then show a QR code and a 6-digit room code.
2. **Pairing:** once the iPhone connects, the QR code and room code disappear and the slide goes full screen.
3. **Presenting:** the cursor is hidden, with no toolbars, popups or toasts.
4. **Backup input:** arrow keys, PageUp and PageDown, and Bluetooth clickers always work.
5. **Black screen:** triggered from the phone or the B key, for prayer or transitions.
6. **Laser pointer:** shows a red dot where the phone points.

**Connection status dot** (always visible, small, in one corner; the same colors on the phone):

| Color | Meaning |
| --- | --- |
| Green | Connected, commands arriving normally |
| Yellow | Weak or slow, reconnecting |
| Red | Disconnected, keyboard still works |
| Grey | Waiting, no remote paired yet |

## iPhone remote (PWA)

The phone is the presenter's private control center, since the laptop shows nothing but slides.

- **Status dot:** the same green, yellow, red and grey dot as the laptop, always at the top of the screen.
- **Main view:** the current page, a preview of the next page, page X of Y, and a timer that can be started and reset.
- **Navigation:** large Next and Prev buttons, plus swipe left and right.
- **Jump to page:** a thumbnail grid of every page. Tap one to jump straight there, and the current page is highlighted.
- **Laser pointer:** hold the current page preview and drag to move the dot on the projector.
- **Black screen:** a toggle button.
- **Gesture lock:** no pinch zoom, no double-tap zoom, no pull-to-refresh, no text selection, no long-press menu and no scroll bounce.
- **Stay awake:** the screen stays on during a session.
- **Auto-resume:** after switching apps or locking the phone, it reconnects to the same room and page with no rescan.

Known iOS limit: no vibration feedback, because iOS Safari doesn't support it.

## Connection and data flow

Both devices talk through a cloud relay room, so they never need to be on the same network.

1. The laptop opens the PDF locally, creates a room and shows the QR code.
2. The laptop renders a low-res thumbnail of each page (about 15 KB) and pushes them to the room.
3. The iPhone scans the QR code, joins the room and loads the thumbnails.
4. The phone sends small commands: next, prev, goto page, pointer position, black screen.
5. The laptop applies each command and reports its current page back, so both screens stay in sync.
6. When the session ends or goes idle for 2 hours, the room and its thumbnails are deleted.

- **Status:** each side sends a heartbeat every 2 seconds. A missed heartbeat turns the dot yellow, and about 10 seconds of silence turns it red.
- **Laptop is the source of truth:** the laptop owns the current page, so a phone that reconnects always lands on the right slide.
- **Data use:** about 1 MB of thumbnails for a 60-page PDF, then only tiny commands.

## Visual theme

Sunset Ticker uses an original neon sunset look on the phone and the start screen, while slides on the projector stay untouched.

| Element | Style |
| --- | --- |
| Colors | Sunset gradient of hot pink, orange and purple, teal accents, dark navy background |
| Headings | Bold, condensed, slightly tilted display font (Anton or Bebas Neue) |
| Start screen | Split-panel layout with the QR code and room code in one panel, sunset art behind |
| Status dot | Glowing neon sign style, same green, yellow, red and grey meanings |
| Phone moments | "Showtime" when paired, "That's a wrap" on the last slide (phone only) |
| Icon | A sun setting behind a single slide, in the sunset gradient |

No third-party logos, characters or artwork are used, so the app is safe to share or publish.

## Tech stack

| Part | Choice | Note |
| --- | --- | --- |
| PDF rendering | PDF.js | Renders slides and thumbnails in the browser |
| Relay | Firebase Realtime Database | Low latency, free tier is enough, auto-cleanup with rules |
| Frontend | Plain HTML, CSS and JS (or Vite) | One site with /view and /remote pages |
| PWA | Manifest + service worker | Add to Home Screen, app shell cached |
| QR | qrcode.js on the laptop, iOS Camera to scan | The QR code opens /remote?room=XXXXXX |
| Keep awake | Screen Wake Lock API | Works in recent iOS Safari |
| Hosting | Firebase Hosting | HTTPS is required for the PWA and the wake lock |

## v2 backlog and open questions

**v2 ideas**

- Speaker notes per page, typed on the phone and stored only on the phone
- Draw or highlight on the slide from the phone
- Audience follow mode, where viewers' phones follow the current page
- Fully offline pairing for when the church internet is down
- A second remote for a co-presenter

**Open questions**

- [ ] Should the black screen be pure black or show a church logo or background image?
- [ ] Should the timer count up, or count down from a set sermon length?
- [ ] Should the status dot on the laptop be hideable, or always on as now?
