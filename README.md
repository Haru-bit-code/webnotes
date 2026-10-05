# WebNotes

A personal, customisable notes web app for people who think in maths, code, diagrams and sketches.

**Live demo:** https://notes-flax-ten-86.vercel.app

## Features
- **Markdown notes** with live preview, LaTeX maths (KaTeX), syntax-highlighted code, tables, checklists
- **Diagrams:** all Mermaid types (flowchart, sequence, class, state, ER, gantt, pie, git graph, mind map, timeline, quadrant, XY chart, architecture…)
- **Charts and plots from text:** ` ```chart ` (CSV → line/bar/scatter/area) and ` ```plot ` (functions of x)
- **Canvas notes:** infinite whiteboard with pen, highlighter, shapes, arrows, text, axes, live function plots, cubes
- **Shape recognition:** hold still after drawing to snap to lines, circles, boxes, polygons, arrows (straight and curved) and cubes; stabiliser and grid snap for mouse/trackpad
- **Touch friendly:** pen-only mode, two-finger pan/zoom, installable as an app
- **Embed sketches** inside Markdown notes
- **AI assistant** (right panel, ⌘J): live insights and chat about your notes. Bring your own key for Anthropic, Groq, OpenRouter, OpenAI, Gemini, Together, Mistral, Ollama or any OpenAI-compatible endpoint
- Tags, folders, search, pin/archive, themes, JSON export/import
- Everything is stored in your browser (localStorage). There is no backend.

## Run locally
```bash
npm install
npm run dev
```

## Deploy
Any static-friendly Next.js host works, e.g. `npx vercel deploy --prod`.

## Privacy notes
- Notes never leave your browser, except text sent to the AI provider *you* configure when you use the assistant.
- API keys are stored in your browser's localStorage and sent only to the provider they belong to.

## Stack
Next.js (App Router), React, Tailwind CSS, marked, KaTeX, Mermaid, highlight.js, DOMPurify, @anthropic-ai/sdk.

## Contributing
Fork the repo, make your change on a branch and open a pull request.

## License
[MIT](LICENSE) © 2026 Ansar Kamal
