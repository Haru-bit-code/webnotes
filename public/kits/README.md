Template assets bundled with WebNotes

- notes/ — "Notes App — Doodle & Scribble Template Kit": 120 portrait page templates (1200 × 1600) and 60 sticker elements.
- pro/   — "Professional Notes & Presentation Kit": 120 16:9 page templates (1600 × 900) and 60 visual elements.

Both kits describe themselves as original, programmatically generated designs with no external or stock assets.
The app converts these SVGs into editable canvas items when a page or sticker is used (src/lib/svgImport.ts).
src/lib/kits.ts is the catalogue generated from each kit's manifest.json.

The element/sticker SVGs have had their viewBox cropped to the drawing so thumbnails are legible; the drawings themselves are unchanged.
