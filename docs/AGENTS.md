# AGENTS.md

Instructions for any AI coding agent working in this repository.
`CLAUDE.md` is a pointer to this file — keep the rules here only, so they never drift apart.

---

## 1. What this project is

A single-player, browser-based, isometric fantasy kingdom simulation. The player never
controls units directly: they build guilds, set a tax rate, and post gold bounties on
flags. Heroes are autonomous agents that decide for themselves using a three-tier AI
stack (utility scoring → GOAP planning → action execution).

Design documents are the source of truth for *what* to build:

- `docs/architecture.md` — layering, determinism, entity model, AI stack
- `docs/mvp-plan.md` — requirements, gameplay, AI spec, milestones, task briefs

If code and the design docs disagree, stop and raise it. Do not silently deviate.

---

## 2. Non-negotiable rules

### 2.1 Determinism

The simulation must produce identical results from identical seeds, on every browser
engine. This is not a preference; the entire test strategy depends on it.

**Banned inside `src/core/**`** (ESLint-enforced — do not disable the rule):

```
Math.random   Math.pow    **          Math.sin     Math.cos    Math.tan
Math.atan     Math.atan2  Math.exp    Math.log     Math.hypot
Date.now      performance.now
```

Permitted: `+ - * /`, `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.round`,
`Math.abs`, `Math.min`, `Math.max`, all bitwise operators.

Consequences you must respect:

- Utility curves are **256-entry integer lookup tables** with linear interpolation.
  Never write an exponent.
- Distance comparisons use **squared** distances. Call `sqrt` only for display values.
- Facings and directions come from a **precomputed 8-entry vector table**, never trig.
- All randomness flows through the world's seeded `xoshiro128**` instance. Never
  instantiate your own RNG.
- Iteration order must be stable. Sort by entity id where order could otherwise vary.

### 2.2 Core purity

`src/core/**` imports nothing from `pixi.js`, `react`, or any DOM global. The core must
run headless in Node. This is lint-enforced and is what makes the test suite possible.

### 2.3 The test contract

Every branch keeps `pnpm test` green. In particular:

- `tests/replay.spec.ts` — two worlds, same seed, identical state hash at tick 10,000
- `tests/soak.spec.ts` — 5,000 ticks with 20 agents; no agent idle >60 s; treasury bounded

If a determinism test fails, that is a **blocking** bug. Do not skip it, do not adjust the
tolerance, do not mark it `.todo`. Find the non-determinism.

---

## 3. File ownership

**The human owns these files. Do not edit them.** If you need a change, describe it in
your summary and stop.

```
src/core/types.ts
src/core/world.ts
AGENTS.md
docs/**
```

Everything else is owned by whichever track is assigned to it. **Stay inside your track's
directories.** If a task appears to require editing another track's files, that is a
signal the contract in `types.ts` is wrong — say so rather than reaching across.

| Track | Directories |
|---|---|
| **A — AI core** | `src/core/ai/**`, `src/core/systems/**` |
| **B — Spatial & render** | `src/core/spatial/**`, `src/render/**`, `src/ui/**` |
| **C — Tooling & content** | `tools/**`, `src/content/**`, `public/**` |

---

## 4. Working style

- **Small commits, conventional messages.** `feat(goap): backward A* planner with node budget`
- **Tests with the code, in the same commit.** Not afterwards, not in a follow-up.
- **No new dependencies without asking.** The dependency list is deliberately short.
- **No `any`.** Strict TypeScript. If a type is hard, that's information — surface it.
- **No commented-out code and no dead branches.** Delete it; git remembers.
- **Prefer data over code.** Classes, buildings, monsters and actions are declarative
  definitions in `src/content/`, validated with zod. Adding content should not mean
  adding logic.
- **Comment *why*, never *what*.** The determinism workarounds especially — future
  readers will otherwise "simplify" a lookup table back into `Math.pow`.

Before starting, read the relevant section of `docs/mvp-plan.md`. Before finishing, run
`pnpm lint && pnpm test`.

---

## 5. Track briefs

### Track A — AI core

The judgment-heavy work. Owns the three-tier stack.

- **Tier 1** `ai/utility.ts` — goal scoring from considerations, 15% incumbency bonus,
  trait weighting via curve-variant blending (never exponents)
- **Tier 2** `ai/goap/` — bitfield world state, backward A* with a 150-node budget,
  LRU plan cache keyed `(goalId, stateHash, classId)`, the 16 MVP actions
- **Tier 3** action runtimes with per-tick `stillValid()` checks
- `ai/blackboard.ts` and `ai/sensors.ts` — staggered sensing, no direct world queries
  during scoring
- `ai/fsm/` — peasants, tax collectors and guards are **plain state machines**, not
  planned agents. They have no self-interest worth planning over.
- `systems/` — combat, economy, construction, spawning, flags, progression

Expose planner cache hit rate and per-goal score breakdowns; the Hero Inspector depends
on reading them.

### Track B — Spatial & render

Crisply specified, heavily testable.

- `spatial/iso.ts` — 2:1 dimetric, tile 64×32, `worldToScreen` / `screenToWorld`,
  depth sort by `(x + y)` tie-broken by entity id
- `spatial/astar.ts` — grid A*, 8-way, octile heuristic, request queue with a per-tick
  budget of ~20 paths
- `spatial/flowfield.ts` — shared fields for high-traffic destinations, recomputed on
  topology change only
- `spatial/hash.ts` — 64px bucket spatial hash, incrementally updated
- `render/` — layered containers, chunked terrain render textures, sprite pool from one
  atlas, position interpolation by tick alpha (never frame delta), camera-bounds culling
- `ui/` — React over the canvas. **All text is DOM, never Pixi text.**
  `HeroInspector.tsx` is a priority, not a nice-to-have: it is the primary debugging
  tool for Track A.

### Track C — Tooling & content

Mechanical, high-volume, cheap to verify by eye.

- `tools/gen-curves.ts` — generate the LUT module; checked-in output
- `tools/make-placeholders.ts` — procedural sprites via sharp; idempotent and re-runnable
- `tools/build-atlas.ts` — pack to PixiJS atlas JSON+PNG, 2px border, typed frame constants
- `tools/fetch-assets.ts` — manifest-driven download with SHA-256 verification
- `tools/gen-credits.ts` — build `CREDITS.md`; **fail the build on any missing license**
- `src/content/` — class stats, building costs, monster definitions, name pools, map data

**Licensing is a hard gate.** Every shipped asset is CC0, CC-BY, or self-made. Verify the
license on its source page before adding it to the manifest. If you cannot confirm a
license, do not add the asset.

---

## 6. Things that look like improvements but are not

- Replacing a lookup table with `Math.pow` "for clarity" — breaks cross-engine determinism
- Adding a floating-point tolerance to the replay hash test — hides the actual bug
- Giving henchmen GOAP "for consistency" — burns CPU for identical behaviour
- Caching a `Float32Array` view over WASM/shared memory across a growth event — detaches
- Introducing an ECS framework — the entity count does not justify it; see architecture doc
- Adding a fourth hero class before milestone 8 — scope is a contract, not a suggestion
