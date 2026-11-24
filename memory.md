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
- 2026-11-23 The "Click or press F for full screen" hint shows whenever the slide isn't full screen (also after Esc) and hides only in full screen. Ee chose this over hiding it after the first key; the audience sees it if presenting without full screen.
- 2026-11-23 Theme moved forward: designed and built right after M1, before M2 (Ee's call), so every test shows the real look. Vibe is an original neon Miami-sunset feel inspired by GTA VI's mood; no Rockstar logo, Pricedown font, characters or artwork.
- 2026-11-23 Device name shown to other phones is auto-detected ("iPhone · iOS 18"), not typed. Timer reset goes back to 0:00 and waits for the next Next.

- 2026-11-23 Local Firebase stand-in (`src/shared/fake-db.js`, `?fakedb` in the URL): same path-based API as the Firebase wrapper in `db.js`, backed by localStorage so laptop and phone frames of one browser can pair. Lets M2+ be tested without the Firebase project; build.sh excludes it from dist/. It applies no security rules, so rules still need one real-Firebase test.
- 2026-11-23 A phone only auto-resumes a saved room if it still holds it (`meta.remote === uid`); after the laptop's R release it does not grab the room back, so a backup phone can pair. A phone also checks `meta.remote` before the claim transaction, because Firebase may answer a held room with permission-denied instead of an aborted transaction.
- 2026-11-23 Accepted for v1: room codes are 6 digits and the `meta` of any room is readable by any signed-in user, so codes can be probed and a free room claimed by anyone who guesses the code. Mitigated by the one-phone lock, the R release and the laptop owning all state.
- 2026-11-23 If Firebase is not configured or unreachable (8 s timeout), the laptop goes straight to the slides, keyboard-only.

- 2026-11-24 Phone commands more than 10 s old are removed without being applied when the laptop reconnects, so a burst of taps from a Wi-Fi drop doesn't make the slides jump.
- 2026-11-24 The laser pointer starts after a 150 ms press-and-hold on the slide. Moving more than 8 px before that counts as a swipe. Only Next starts the timer, not grid jumps or Home/End.
- 2026-11-24 Pinch zoom is blocked on the phone remote, which hurts accessibility (WCAG 1.4.4). This is open for Ee to review.
- 2026-11-24 "That's a wrap" shows only when the laptop deletes the room. It doesn't show on the phone's Disconnect or the R release.
- 2026-11-24 The repo is public, so the filled-in `src/shared/firebase-config.js` is gitignored; `firebase-config.example.js` is the committed template and `build.sh` copies it in when the real file is missing (Ee's choice over committing a restricted key).
- 2026-11-24 The stale-room query uses an exact cutoff: Firebase time minus 2 h, rounded down to the minute, minus 2 min. The rules accept only cutoffs 1-3 minutes past the 2 h mark, which still keeps fresh room codes unlistable.

- 2026-11-24 Phone Prev/Next is "option C" (Ee's pick from 3 product-designer mockups): a quiet outlined Prev square and a big gradient Next, so the button used ~95% of the time is obvious and a mis-tap on Prev is less likely.

## Rejected Approaches
- 2026-11-23 Firebase Hosting (spec's choice): dropped for the droplet, see Decisions.
- 2026-11-23 Vite (mentioned in the spec as an option): rejected to keep the no-build, plain-JS stack.
- 2026-11-23 "Auto-cleanup with rules" (spec wording): Realtime Database rules can't delete data on their own. Cleanup must be done by a client or a scheduled job. Cloud Functions scheduled jobs need the paid Blaze plan, so not used.
- 2026-11-23 Deleting the room with `onDisconnect().remove()` on the laptop: a short Wi-Fi drop would wipe the room mid-service. `onDisconnect` only marks the laptop offline.

- 2026-11-24 Full screen on/off from the phone: dropped (Ee). Browsers only enter full screen after a click or key press on the laptop itself, so the phone could only ever exit it; F / click on the laptop is enough.

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
- 2026-11-23 Theme mockups made (design-system/): sunset-sun-over-grid art on the start panel and phone moments only; main remote view stays plain dark. Buttons use dark ink (#1a0830) on the pink-orange gradient because white on pink fails AA. Anton is Latin-only, so Thai/Japanese text never uses it. Awaiting Ee's approval before building.
- 2026-11-23 `database.rules.json` ends every room with `$other: .validate false`: any new path (M3 state/cmds/thumbs) is rejected until the rules are extended and re-pasted in the console.
- 2026-11-23 For driving headless Chrome over DevTools, Node 24 at ~/.nvm/versions/node/v24.16.0 has a built-in WebSocket (Node 18, the nvm default, doesn't); see tests/m2-cdp.mjs.
- 2026-11-24 The owner's room-level `.write` covers every path inside the room, so the laptop *can* delete `laser`. A builder assumed it couldn't.
- 2026-11-24 Rooms created without a `roomIndex` entry are never cleaned up by the lazy 2 h cleanup (parked in todo.md under "Later").
- 2026-11-24 `sw.js` and the manifest have fixed URLs, and Cloudflare caches .js for 4 h, so they need `no-cache` at nginx or phones pick up new versions late.
- 2026-11-24 Realtime Database rules: `query.endAt` (likely all query bounds) only works with `==`; `<`, `<=` against it are always false, even against a constant, so `query.endAt <= now - 7200000` never passed. Found with throwaway `diag/` rule nodes, one clause each.
- 2026-11-24 Firebase JS SDK v11 rejects `ref(db, '')` ("invalid path"); use `ref(db)` for root multi-path updates. The `?fakedb` stand-in accepted '', so room creation only failed against real Firebase. Always run one real-Firebase pass after fake-db tests.
- 2026-11-24 Testing with real Firebase needs separate Chrome profiles for laptop and phone: frames of one browser share one anonymous uid, so the rules can't tell them apart.
- 2026-11-24 iPhone WebKit (Safari and Chrome on iOS) squeezes boxes whose height comes only from `aspect-ratio` when their flex column or grid runs short: grid rows overlapped and the Next-up preview ran into the buttons. Desktop Chrome never showed it. Phone boxes are sized with `height: 0; padding-top: N%` instead; keep a `padding` shorthand from coming after it (it reset the padding-top and made every cell 0 px tall).
- 2026-11-24 nginx `no-cache` on sw.js was not enough: Cloudflare's zone Browser Cache TTL (4 h) rewrote it to `max-age=14400` and kept serving its edge copy (HIT). A Cloudflare Cache Rule (URI Path equals /apps/sunset-ticker/remote/sw.js → Bypass cache) fixed it; the manifest needed no rule because Cloudflare doesn't cache .webmanifest. Check the origin directly with `curl --resolve` to tell nginx from Cloudflare.
- 2026-11-24 The laptop's file-change handler is async, so any throw inside it is silently swallowed. Anything shown at the start (like the loading screen) must be closed in a `finally`, not on each path.
