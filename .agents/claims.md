# Active claims

Append at the top. Close a claim by changing OPEN to DONE plus the commit sha.
Read this file, then `git log --oneline -15`, then
`git log --oneline --all -- <path>`, BEFORE starting any task.

See docs/09-two-agent-protocol.md §4.

| Status | Agent  | Date       | Paths | Task |
|---|---|---|---|---|
| DONE   | claude | 2026-09-06 | docs/10-world-generation.md | world generator, caves, ruins, POIs and Catalan content plan |
| OPEN   | codex  | 2026-09-06 | art/source/**, art/concepts/**, art/reference/**, art/*.md | Catalan art direction: concepts and source pipeline |
| DONE   | claude | 2026-09-06 | src/render/event-fx.ts, src/ui/EventOverlay.tsx, src/ui/ui.css, tests/ | wire dead ground-fx, event floaters, label legibility |
| DONE   | claude | 2026-09-06 | public/**, docs/art-direction/**, art/frames/** | 85a84f9 stop shipping build inputs |
