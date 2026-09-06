# 09 — Two-agent coordination protocol

**Agents:** `Claude` (Claude Code) and `Codex` (OpenAI Codex CLI). Same machine, same clone, same `main`.

This document exists because the failures below already happened in this repo. Every rule traces to
a commit, a file, or a script that is actually here. Read it with `docs/AGENTS.md`; where the two
disagree, `AGENTS.md` §2 (determinism, core purity, test contract) wins.

## 0. Verified ground truth

| Fact | Evidence |
|---|---|
| Attribution signal | Claude commits carry `Co-Authored-By: Claude Opus 5 (1M context)`; Codex commits carry no co-author trailer. Holds for all 40 commits inspected. |
| Codex commits | `c8345ad` `eac1bf6` `c281851` `dd7cbc2` `d173c5b` `af3d2e7` `65db762` `2429893` `68bec11` `87d45b7` `597f1b0` |
| `pnpm pregen` is idempotent today | Run on a clean tree: ~2 s, zero git drift on tracked files. |
| No CI, no git hooks | No `.github/`, no `core.hooksPath`, only `.git/hooks/*.sample`. **Every gate below is local discipline. Nothing catches a violation for you.** |
| Worktrees | Exactly one: the main clone. |

`docs/AGENTS.md` §3's Track A/B/C map is **stale** — it predates the two-agent split. Claude has
committed into `src/content/**`, `src/ui/**` and `tools/**`; Codex has committed into
`src/content/**` and `src/core/spatial/**`. §1 supersedes the track table for these two agents.

## 1. Ownership map

**Owner** may commit unilaterally. Crossing a boundary is allowed for a targeted defect fix, but the
commit body must say so.

| Glob | Owner | Rule |
|---|---|---|
| `src/core/types.ts`, `src/core/world.ts` | **Human** | Neither agent edits. Propose in prose and stop. |
| `src/core/**` (all else) | Claude | Determinism-gated by `eslint.config.js`. Codex opens a branch and hands back. |
| `src/core/spatial/**` | Codex → Claude review | Codex authored it; it is inside the gate, so Claude re-runs `pnpm test` before merge. |
| `src/render/**` | **Codex** | Claude touches only to fix a cross-boundary break, and says so. |
| `src/render/frames.gen.ts` | **Neither — generated** | Written by `tools/build-atlas.ts`. See §2. |
| `src/ui/**` | **Codex** | Claude fixes defects (invisible labels, z-order), Codex decides what it looks like. |
| `src/app.tsx` | **Contested — claim first** | Both have landed structural changes. Holds the atlas staleness guard. |
| `src/content/**` | Codex owns schemas/data; Claude owns balance + maps | Determinism-gated. |
| `tools/**` | **Codex** | Claude may add guards; announce. |
| `art/source/**`, `art/concepts/**`, `art/reference/**`, `art/*.md` | **Codex** | Claude does not touch, move, or `git add` these. |
| `art/frames/**` | **Generated** | Output of `stage-b.ts` and input to `build-atlas.ts`. Nobody paints here by hand. |
| `art/reference/raw/**` | Local only | Gitignored. Never `git add -f`. |
| `public/atlas/*`, `public/assets.manifest.json` | **Neither — generated** | Regenerate, never hand-merge. |
| `public/**` (anything else) | **Frozen** | Everything in `public/` is copied verbatim into `dist/`. Adding a file here is a shipping decision. |
| `docs/**` | **Human** | Both agents propose. Exception: this file, which either agent may amend by appending a dated note. |
| `tests/**`, `e2e/**`, `playwright.config.ts` | **Claude** | Codex adds tests beside its own code; Codex does not restructure the harness. |
| `eslint.config.js`, `tsconfig.json`, `vite.config.ts`, `package.json` | **Claude**, human-visible | Loosening the determinism gate is never an agent decision. |
| `.gitignore` | Either, append-only | Never delete another agent's entry. |

## 2. The generated-artifact contract

`pnpm pregen` = `gen-curves` → `gen-names` → `make-placeholders` → `stage-b` → `build-atlas`. It
takes about two seconds. There is no excuse for skipping it.

`build-atlas.ts` writes four files from one run. **They are one artifact in four files.** This is
exactly what broke behind `dd84261`: `frames.gen.ts` went from 110 to 299 frames without
`game.json` being repacked, so every `sheet.textures[name]` returned `undefined` and the world
rendered as bare ground with **no console error**.

> **Rule:** these four paths change together in a single commit, or not at all:
> `public/atlas/game.png` · `public/atlas/game.json` · `public/assets.manifest.json` ·
> `src/render/frames.gen.ts`
>
> A diff touching a strict subset of that set is a rejected commit.

Same rule, smaller scope: `art/frames/**` moves with the atlas set, because `build-atlas.ts` reads
`art/frames` as its only source.

**Who runs it:** whoever last modified `art/frames/**` or anything under `tools/`. It is idempotent,
so running it needlessly costs two seconds and produces no diff.

**The verification:**

```bash
pnpm pregen && git status --porcelain    # must print nothing about tracked files
```

Drift means the tree you were about to commit did not come from the generators: someone hand-edited
a generated file, a generator became non-deterministic, or the tree was stale. All three block.

**Merge conflicts.** `game.png`, `game.json` and `assets.manifest.json` conflict on every merge,
because both agents regenerate them from different frame sets. Never resolve by hand — a
hand-merged PNG is corrupt and a hand-merged `game.json` desynchronises from `frames.gen.ts`. Take
either side, then `pnpm pregen`, then verify the tree is clean.

## 3. Handoff gates

Run in order. Stop at the first failure.

```bash
pnpm pregen && git status --porcelain   # 1. generated artifacts are a fixed point
pnpm lint                               # 2. eslint . && tsc --noEmit
pnpm test                               # 3. headless simulation suite
pnpm test:cross-engine                  # 4. REQUIRED for src/render, src/ui, src/app.tsx,
                                        #    public/atlas, art/frames, or src/core
pnpm build && du -sh dist               # 5. REQUIRED if you added anything under public/
```

Gate 5's number: `dist` is **1.1 MB**. It was 20 MB before `85a84f9`. Over ~2 MB means a build input
leaked into `public/` again.

Gate 4 is not optional for renderer work. `pnpm test` excludes `tests/**/*.playwright.spec.ts`, so
the stale-atlas guard in `src/app.tsx` — the one thing that catches a 110→299 frame break — **only
runs under Playwright**. Skipping gate 4 reinstates the exact silent failure it was written for.

**Commit-message contract.** Every commit states, in the body: which gates ran by script name and
which were skipped with the reason; whether the golden replay hash moved; and any file owned by the
other agent that this commit touched, and why. Claude keeps its `Co-Authored-By` trailer — it is the
only reliable way to tell the two agents apart in `git log`; Codex must not add one.

**The untested-handoff rule.** `9de58b0` committed `src/content/buildings/placement.ts` that had
never been executed: three `noUncheckedIndexedAccess` violations and a spec that contradicted its
own implementation. A commit body may not claim a gate that was not run. "lint not run" is
recoverable; a false green is not.

## 4. Claim protocol

Duplication has cost this project three times: fanned-out subagents redid C5/C6, the Playwright
harness, and C2–C10, all already committed by Codex. The fix is one file, checked before starting.

`.agents/claims.md` is an append-only table, newest at the top, one line per claim.

**Before starting work:**

```bash
cat .agents/claims.md
git log --oneline -15
git log --oneline --all -- <the path you intend to touch>
```

That third command is what would have prevented all three duplications.

Rules: claiming is a one-line append — no prose, no estimate, or it will be skipped under pressure.
An OPEN claim by the other agent on a path is a hard stop. Close claims in the same commit that
finishes the work. Never spawn subagents onto a path with someone else's OPEN claim, and never spawn
two subagents onto the same path.

## 5. Branch and worktree hygiene

Codex once left ~400 lines uncommitted in a stray worktree, rescued twice (`9de58b0`, `dd84261`).
Claude separately came close to deleting a branch holding unmerged commits.

| Rule | Command |
|---|---|
| Never delete a branch without checking for unmerged commits | `git log --oneline main..<branch>` must print nothing before `git branch -d`. Never `-D` a branch you did not create this session. |
| Never remove a worktree without checking for uncommitted work | `git -C <worktree> status --porcelain` must print nothing. |
| Enumerate before you assume | `git worktree list` at the start of every session. |
| Commit before you switch context | A worktree is not a save. Anything worth keeping past one session is a commit on a branch, even a WIP commit. |
| Branch naming | `<agent>/<backlog-id>-<slug>`, e.g. `codex/C11-catalan-palace`. |
| One agent per branch | If the other agent must build on your branch, it branches off it. It does not commit onto it. |

## 6. Cross-boundary invariants

| # | Invariant | Guard | Status |
|---|---|---|---|
| 1 | No `Math.random`, transcendental `Math.*`, `Date.now`, `**`, pixi/react imports, or `window`/`document` in `src/core/**` and `src/content/**` | `eslint.config.js` via `pnpm lint` | exists |
| 1a | The gate does **not** cover `src/render/**`, `src/ui/**`, `src/app.tsx`, `tools/**`, `tests/**`, and is off for `**/*.gen.ts` | — | by design. A `Math.random` in `src/render` is legal; the moment its value reaches simulation state it is a determinism bug lint cannot see. |
| 2 | The gate holds in practice: identical hashes on Node + Chromium + Firefox + WebKit | `e2e/determinism.spec.ts` | exists |
| 3 | Tick order (`docs/02-architecture.md` §2.2) is never reordered | the golden replay hash | indirect — reordering breaks the hash, but nothing names the cause. Any commit that renumbers a step must say so. |
| 4 | `frames.gen.ts` and `game.json` agree | `src/app.tsx` throws, naming the count and first missing frame | exists — **but only reached under Playwright** |
| 4a | Every frame the renderer can select exists in the atlas | `tests/facing.spec.ts`, `tests/stage-b.spec.ts` | exists, headless |
| 5 | Everything in `public/` ships into `dist/` | `tests/shipping.spec.ts` | exists |
| 6 | `pnpm pregen` is a fixed point | — | **missing.** Holds today by discipline only. A spec that shells `pregen` and asserts a clean tree would convert all of §2 into a test. |
| 7 | Every shipped asset is CC0 / CC-BY / self-made | `tools/gen-credits.ts --check` via `prebuild`, `tests/assets.spec.ts` | exists, strong |
| 8 | Terrain types are visually distinguishable | colour-distance guard in `tools/stage-b.ts`, fails the build | exists |
| 9 | DIR8 is tile-space, the atlas is screen-space, one step apart under `sx = x − y` | `tests/facing.spec.ts`, derived from `worldToScreen` | exists |
| 10 | Chrome draws above world-space overlays | `tests/app.playwright.spec.ts` | exists |
| 11 | `types.ts` and `world.ts` are human-owned | — | **missing.** Prose only; there are no git hooks at all. |

**Further collision risks.** There are two files named like a manifest: `assets.manifest.json` at the
repo root is hand-maintained; `public/assets.manifest.json` is generated. Editing the generated one
is a silent no-op the next `pregen` erases. Two test runners share the `tests/` directory, split by
filename: a misnamed spec runs in the wrong engine or in none, and passing zero tests looks
identical to passing all of them. And `docs/art-direction/` is 14 MB of tracked binaries that every
clone pays for, with no cap on growth.

## 7. Escalation

**Codex stops and hands to Claude when:** a change touches `src/core/**` beyond
`src/core/spatial/**`; `pnpm test` fails or the golden hash moves for a non-obvious reason;
`test:cross-engine` disagrees between engines; the work needs a new dependency, an ESLint exception,
or an edit to `types.ts`/`world.ts`; anything must be added under `public/`; more than ~300
uncommitted lines have accumulated (commit to a branch first — both rescues started here); or the
art plan requires a mechanics change.

**Claude stops and hands to Codex when:** a fix inside `src/render/**`, `src/ui/**` or `tools/**`
grows from a targeted defect fix into a redesign; visual or art-direction judgment is required —
Claude fixes *invisible*, Codex decides *what it looks like*; anything under `art/source/**`,
`art/concepts/**` or `art/reference/**` needs to change; or before deleting any branch or worktree
Codex may have created.

**Either stops and asks the human when:** the change is to `types.ts`, `world.ts` or `docs/**`; code
and the design docs disagree; an asset licence cannot be confirmed; the two agents' claims genuinely
conflict; or the scope is one `docs/08-decisions.md` already rejected.
