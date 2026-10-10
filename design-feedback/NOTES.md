# Simulator findings for the design review (evenhub-simulator 0.9.5, SDK 0.0.14)

Even's docs say simulator rendering "isn't pixel-perfect with hardware (font, greyscale levels)" and
list focus positioning can differ (https://hub.evenrealities.com/docs/test/simulator). Confirm on the G2.

## Line height and font
- **Text line pitch is 24 px.** This matches your assumption. Home now fits 8 rows in the 226 px area.
- **Native list rows are about 40 px apart, not 24.** Need-item actions showed only 2 of 3 at 90 px. I moved
  `what` to 34..98, `since` to 100, and `acts` to 132 with h 124, so all 3 show. The Needs list also
  drew its rows starting mid-container.
- **"20/20" wrapped in the 48 px counter column.** Widened it to 60 px (list column 516).
- Proportional font: 5 spaces roughly equal the width of "▶ ", so unselected rows line up.
- Glyphs from Even's useful-characters table render: ■ ● ○ ▶ ◀ △ ▼ ▽ ━ ─. The level meter (▁..▇) reads as a
  stepped bar, fine.
- Whitespace runs collapse in our clean() pass, so "Bot   reply" became "Bot reply". Changed to
  "Bot: reply" and "You 9:57 - text".

## Brightness (alpha of lit pixels, RGBA screenshots, 255 = full)
| textColor | alpha | % |
|---|---|---|
| 4 focus | 255 | 100 |
| 3 secondary | 230 | 90 |
| 2 meta | 197 | 77 |
| 1 hint | 179 | 70 |
Border bcolor 6 = 214, bcolor 10 = 255. Levels 1 and 2 are only 7% apart, so hint and meta barely differ.
textColor 1 is clearly legible in the simulator. Check on hardware outdoors.

## Interaction findings that changed the design
1. **Native list containers send no swipe events, only press (with index).** So the app can't know the
   highlighted row, and "long press talks to the SELECTED bot" was impossible with a list. Home is now one
   capture text container drawn by the app with a ▶ cursor. That is Even's "fake buttons" pattern
   (https://hub.evenrealities.com/docs/build/design-guidelines). The position counter is now exact.
   Because the cursor is ▶, the More row uses ▽.
2. A press on list row 0 arrives with neither index nor name. Handled as row 0.
3. Every boundary swipe now flashes the header ("Top of list", "End of reply"). Even QA asks for a visible
   response to every gesture.
4. The contextual menu overlay renders over our left column. It's expected, nothing to fix.

The simulator screenshots that went with these notes were removed (Oct 10, 2026) because they showed
personal bot names; they covered the pre-1.0 relay-era screens. Store screenshots are in store/screenshots/.
