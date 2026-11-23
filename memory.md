# Sunset Ticker — memory

## Decisions
- 2026-11-23 No build step: plain ES modules loaded straight by the browser; `build.sh` only copies `src/` to `dist/`. PDF.js, Firebase and the QR library come from CDN as ES modules.
- 2026-11-23 The phone never loads PDF.js. It only shows the JPEG thumbnails the laptop pushes, so the PWA stays small and fast on mobile data.
- 2026-11-23 Both sides sign in with Firebase Anonymous Auth so the database rules can tell the laptop (room owner) from the paired phone (room remote).
- 2026-11-23 A room locks to the first phone that joins. The QR and room code are on the projector, so anyone in the audience could otherwise scan and take control. A laptop key releases the lock for a backup phone.
- 2026-11-23 Phone commands go into a queue that the laptop applies in order and then removes, so fast repeated taps are never lost. The laptop alone writes `state` (page, black), so it is the source of truth.
- 2026-11-23 Connection status is based on when each heartbeat arrives locally, not on comparing timestamps, so clock differences between laptop and phone don't matter.

- 2026-11-23 Hosting on the droplet (estains-tech.com/apps/sunset-ticker/, HTTPS via Cloudflare) instead of Firebase Hosting: already set up, no firebase CLI or Node 20 needed. Firebase is used only for Realtime Database + Anonymous Auth; rules are pasted in the console.
- 2026-11-23 Stale rooms are removed by lazy cleanup only (each new session deletes rooms idle > 2 h); no cron job.
- 2026-11-23 Laptop reload means picking the PDF again; nothing is stored on the borrowed laptop.
- 2026-11-23 Black screen is pure black with a short fade. Status dot on the laptop is always on.
- 2026-11-23 Timer counts up from the first Next (phone or keyboard); its start time lives in the room so it survives a phone reload.

- 2026-11-23 Changing slides while the black screen is on keeps it black (lets the presenter line up the next slide during prayer); only B / "." or the phone turns it off. Unlike PowerPoint, where any key un-blacks.
- 2026-11-23 The "press F for full screen" hint hides for good after the first slide key or 8 s, since in Duplicate mode the audience sees it.
- 2026-11-23 Device name shown to other phones is auto-detected ("iPhone · iOS 18"), not typed. Timer reset goes back to 0:00 and waits for the next Next.

## Rejected Approaches
- 2026-11-23 Firebase Hosting (spec's choice): dropped for the droplet, see Decisions.
- 2026-11-23 Vite (mentioned in the spec as an option): rejected to keep the no-build, plain-JS stack.
- 2026-11-23 "Auto-cleanup with rules" (spec wording): Realtime Database rules can't delete data on their own. Cleanup must be done by a client or a scheduled job. Cloud Functions scheduled jobs need the paid Blaze plan, so not used.
- 2026-11-23 Deleting the room with `onDisconnect().remove()` on the laptop: a short Wi-Fi drop would wipe the room mid-service. `onDisconnect` only marks the laptop offline.

## Gotchas
- 2026-11-23 iOS Camera opens a scanned QR link in Safari, not in the installed Home Screen PWA (separate storage). The PWA needs its own way in: typing the 6-digit code (and optionally an in-app scanner). BarcodeDetector doesn't exist on iPhone.
- 2026-11-23 Browsers only allow full screen after a click or key press on the laptop. It can't switch to full screen automatically when the phone pairs; the presenter clicks once (or presses F) before the service.
- 2026-11-23 Chrome/Edge show "Press Esc to exit full screen" for a few seconds when entering full screen; on Duplicate the audience sees it. Enter full screen before people arrive.
- 2026-11-23 Screen Wake Lock inside a Home Screen PWA was broken on iOS until 18.4; it's released whenever the app goes to the background and must be requested again on return. Low Power Mode can refuse it.
- 2026-11-23 Wake lock, service worker and camera need HTTPS. MAMP over the LAN is plain HTTP, so real iPhone tests need a deployed HTTPS URL.
- 2026-11-23 PDF.js needs `cMapUrl` + `standardFontDataUrl` (CDN paths of the same version) or Thai/Japanese text and non-embedded fonts silently go missing; it only warns in the console, so Latin-only test PDFs never catch it.
- 2026-11-23 Full-screen slide canvases are big (~30 MB each on Retina/4K). Cancel PDF.js render tasks and set canvas width/height to 0 when dropping pages from the cache, and skip pre-rendering while a key auto-repeats, or a held arrow key can eat hundreds of MB.
- 2026-11-23 Load the CDN PDF engine with a dynamic `import()`: a failed static import stops the whole module silently, leaving a dead page with no message.
- 2026-11-23 Cloudflare caches CSS/JS for 4 h and the PWA service worker caches too: bump `?v=` / the cache name on every deploy. Add estains-tech.com to Firebase Auth's authorized domains or anonymous sign-in fails.
- 2026-11-23 Duplicate mode often drops to a shared resolution (sometimes 4:3), so slides must be fit with letterboxing and re-rendered on resize.
- 2026-11-23 Realtime Database rules cascade: a `.write` granted on a parent can't be taken away on a child. Remote permissions must be granted only on the specific child paths.
