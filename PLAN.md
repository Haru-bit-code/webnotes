# WebNotes – Plan

## Decisions (from Q&A)
- Storage: browser only (localStorage), JSON export/import for backup
- Editor: Markdown with edit / split / preview modes
- Features: tags & folders, instant search, pin & archive, dark mode + themes (accent colour, font)
- Stack: Next.js (App Router) + Tailwind, deployed to Vercel

## Architecture
- `src/lib/types.ts` – Note, Settings types
- `src/lib/store.ts` – React hook `useNotes` (state + localStorage persistence)
- `src/lib/markdown.ts` – tiny dependency-free Markdown renderer (swap for `marked` if desired)
- `src/components/` – Sidebar, NoteList, Editor, SettingsPanel
- Theming via CSS variables (`--accent`, font) so customising = edit one file / the settings panel

## Milestones
1. Scaffold Next.js + Tailwind
2. Data layer + persistence
3. UI: sidebar (folders, tags, archive), list (search, pin), editor (markdown + preview)
4. Settings: theme, accent, font, export/import
5. Build check, then deploy to Vercel

## Customising later
- Colours/fonts: `src/app/globals.css` and Settings panel
- New fields: extend `Note` in `types.ts`
- Cloud sync: replace load/save in `store.ts` with an API/Supabase

## v2 – Scientist's notebook
- Note kinds: `doc` (Markdown + extensions) and `canvas` (infinite vector whiteboard)
- Doc extras: KaTeX math, Mermaid diagrams, ```chart (CSV) and ```plot (functions) blocks, code highlighting, tables, insert-snippet menu, templates
- Canvas: pen, highlighter, eraser, line, arrow, rect, ellipse, text, axes, live function plots, select/move, undo/redo, pan/zoom, grid styles, PNG/SVG export

## v3 – AI assistant (right-hand panel, ⌘J)
- Bring-your-own Anthropic key, stored only in the browser; calls go browser → api.anthropic.com via @anthropic-ai/sdk
- Insights tab: auto-review after a pause (structured JSON: ideas / questions / issues / connections / answers)
- Chat tab: streamed answers, quick actions, "insert into note"; replies render maths, mermaid, plots, charts
- Context: current note + (optionally) all other notes, cached as a system block
