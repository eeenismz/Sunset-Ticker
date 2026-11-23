# Sunset Ticker: visual theme (proposal, awaiting approval)

Open `index.html` (http://localhost:8888/workplaces/sunset-ticker/design-system/) for every screen. `preview.png` is a full-page screenshot.

## Rationale
Original neon Miami-at-dusk: a striped sun setting over a perspective grid, palm silhouettes, hot pink to orange to gold gradients, teal for "live / current", on a night-indigo base. Boldness is spent in one place: the tilted Anton display type (SUNSET gradient, TICKER teal outline) plus the sun art on the start panel and the two phone moments. Everything the presenter uses under pressure (Next/Prev, timer, black screen) is plain dark panels with large targets. The projector only ever sees a small dark pill and a 10px dot. Nothing from Rockstar: no logo, wordmark, Pricedown, characters, "VI", or place names. All art is CSS/SVG made here.

## Tokens (see tokens.css)
- Colors: night #0a0720, night-2 #150c35, dusk #3b1167, pink #ff2e88, orange #ff8a3d, sun #ffd15c, teal #19e3d0, text #fff4f0, text-soft #c4b6ec, text-dim #9486c4, ink #1a0830 (dark text on gradient buttons).
- Status dot: grey #8a86a3, green #3dff8b, yellow #ffd23f, red #ff3b4e (each with a neon glow).
- Type: display Anton (headings, big numbers, button labels only; tilted with `--tilt`), body system-ui, kbd in ui-monospace.
- Glow, radii (10/16/24/pill), 4px spacing scale, `--tap: 56px`, grain and scanline textures, focus ring (teal).
- Contrast: body text on night is about 16:1, soft text about 9:1, dim text 5:1 or better. Buttons use dark ink on the pink-orange gradient (6:1 or better) instead of white, because white on pink fails AA for small text.

## Mapping to the current viewer
`.start` -> `#start` (now two panels), `.btn` -> `.btn`, `.msg` -> `#msg`, `.keys` -> `.keys` (now a dl with kbd chips), `.hint` -> `#hint`, `.dot.grey/green/yellow/red` -> `#dot` classes. New for M2/phone: `.pair`, `.qr`, `.code`, `.moment`. Component CSS currently lives in the mockup's `<style>`; fast-worker ports it.

## Build notes
- Self-host Anton (woff2) in the build; the mockup uses Google Fonts only for preview. Anton has no Thai or Japanese glyphs: only use it for Latin text, and make sure fallbacks look right.
- Grain, scanlines and the palm/sun art stay out of `#stage`. The black screen stays `#000`.
- Reduced motion is handled in tokens.css (pulse and progress animations stop). Phone moments should not depend on motion.
- iOS PWA icon: use icon.svg exported to a 180px PNG (apple-touch-icon); the SVG is full-bleed, iOS rounds it.

## Choices for Ee
1. **Sun art on the phone:** I kept the phone's main view plain and only gave the art to join, Showtime and Wrap, so thumbs and eyes stay on the controls in a dark church. Alternative: a faint sunset glow behind the whole remote. More vibe, less calm.
2. **Neon dot on the projector:** the dot has a soft glow and 85% opacity, still 10px. It is the only neon the audience sees. Option: drop the glow on the laptop and keep it on the phone only. The dot also relies on color alone on the laptop; add a shape or a pulse for red if some viewers are colorblind (the phone already has text labels).
3. **Button text color and type:** buttons use dark ink on the pink-orange gradient (AA-safe, punchier than white). Alternative is a deeper pink with white text, which reads more "neon sign" but needs a darker pink (#d6126b) to pass AA. Also: Anton (heavier, used here) vs Bebas Neue (lighter, all caps only).
