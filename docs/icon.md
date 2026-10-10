# BUD icon: use Even's own editor (no custom pictures)

**Where:** the Even Hub Developer Portal, in the app's store-listing/submission form. Log in at
https://hub.evenrealities.com/login, open the project, and draw the icon in the built-in 24x24 pixel editor.
Even's docs: "The icon on your store listing … is drawn in the Developer Portal's 24 x 24 pixel editor and
validated on upload" (https://hub.evenrealities.com/docs/build/design-guidelines#the-store-icon).
It's a web tool behind login. There is no CLI or npm equivalent: `evenhub` (CLI 0.1.14) only has
`login`, `init`, `pack`, and `qr`, and `pack` has no icon option (checked `evenhub --help` and the CLI source).

**Inputs:** a 24x24 grid you draw on, pixel by pixel, in two tones. Documented rules:
- 1-bit monochrome. Each pixel is fully on or off, with no greys and no anti-aliasing.
- Every lit pixel must be part of a 2x2 lit block, so the thinnest stroke is 2 px and the effective detail is 12x12.
- Greyscale only (color is rejected). Legible, so no "black scribble" or noisy patterns.
- "Both foreground and background are supplied (neither null nor empty)."

Sources: the design-guidelines page above and https://hub.evenrealities.com/docs/ship/app-submission.
Even's docs list no glyph sets, letter tools, presets, or image import for this editor. An unofficial
community tool, g2-icon-studio (https://github.com/naotake/g2-icon-studio, "Unofficial"), describes the portal editor
the same way: a 24x24 two-tone grid with no image import.

**How it's used in packaging:** it isn't. The icon is store-listing metadata, entered and validated in
the portal; `evenhub pack` never reads an icon. Even's templates do include `public/icon.png` (24x24 greyscale)
(https://hub.evenrealities.com/docs/get-started/quickstart/templates), but the docs don't say that the
portal or the pack step uses it. BUD ships no icon file.
