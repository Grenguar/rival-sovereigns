# 07 — Backlog

Task IDs are stable. Reference them in branch names (`feat/A3-planner`) and commits.

**Tracks:** **H** = human only · **A** = AI core · **B** = spatial & render · **C** = tooling & content

---

## Milestone 0 — Foundation *(solo, no parallelism)*

Nothing forks until these are done and `types.ts` is frozen.

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **H1** | H | Vite + TS strict + Vitest + ESLint + Prettier scaffold | — | `pnpm test` runs |
| **H2** | H | ESLint determinism config per `docs/03-determinism.md` §5.1 | H1 | A file using `Math.random` in core fails lint |
| **H3** | H | `core/rng.ts` — seeded xoshiro128** with `snapshot()` | H1 | Same seed → same 10k-number sequence |
| **H4** | H | `core/hash.ts` — FNV-1a world hasher | H1 | Stable across runs |
| **H5** | H | `core/types.ts` — **freeze the contracts** | H1 | Entity, Handle, Command, Snapshot, Agent, ActionDef, GoalDef all defined |
| **H6** | H | `core/world.ts` — tick loop, entity pool, generational handles, command queue | H3–H5 | `replay.spec.ts` passes at 10,000 ticks |
| **H7** | H | Git worktrees + branch strategy + `AGENTS.md` in repo | H1 | Three worktrees exist |

**Gate:** H5 frozen and H6 green. Do not fork tracks before this.

---

## Milestone 1 — Headless world

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **B1** | B | `spatial/grid.ts` — tiles, terrain, walkability, occupancy | H5 | Unit tested |
| **B2** | B | `spatial/iso.ts` — projection, `DIR8`, depth sort | H5 | Round-trip `worldToScreen`/`screenToWorld` exact |
| **B3** | B | `spatial/astar.ts` — 8-way, octile, request queue with 20/tick budget | B1 | Path found in <2ms on 96×96 |
| **B4** | B | `spatial/hash.ts` — 64px buckets, incremental | B1 | Proximity query correctness test |
| **B5** | B | `spatial/flowfield.ts` — shared fields, topology invalidation | B1,B3 | Field matches A* destination for 100 random starts |
| **A1** | A | `systems/movement.ts` — path following, facing, arrival | B2,B3 | Two entities meet deterministically |
| **A2** | A | `systems/combat.ts` — attack intervals, armour, death | H5 | Hero kills ratkin in <200 ticks, same every run |
| **C1** | C | `tools/gen-curves.ts` → `curves.gen.ts` | H5 | 6 families × 3 variants, 256 entries, checked in |
| **C2** | C | `content/` zod schemas for classes, buildings, monsters | H5 | Invalid content fails at load with a clear error |

**Gate:** `soak.spec.ts` runs 5,000 ticks with 10 entities, no crashes, stable hash.

---

## Milestone 2 — The AI *(highest risk in the project)*

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A3** | A | `ai/goap/state.ts` — bitfield state, `satisfies`, `regress`, hash | H5 | Unit tested |
| **A4** | A | `ai/goap/planner.ts` — backward A*, 150-node budget | A3 | Property test §3 of `06-testing.md` passes |
| **A5** | A | `ai/goap/cache.ts` — LRU 512, hit/miss counters | A4 | Hit rate >80% in soak |
| **A6** | A | `ai/goap/actions.ts` — all 16 MVP actions | A3,C2 | Each has pre/eff/cost/isValid/bind/runtime |
| **A7** | A | `ai/utility.ts` — scoring, compensation, incumbency, trait curves | C1 | `ScoreBreakdown.parts` retained for inspector |
| **A8** | A | `ai/blackboard.ts` + `ai/sensors.ts` — staggered sensing | B4 | No direct world query during scoring |
| **A9** | A | 8 goals with considerations per `04-ai-spec.md` §4 | A7 | All wired |
| **A10** | A | `ai/fsm/` — peasant, tax collector, guard | H5 | Three FSMs, no planner involvement |
| **C3** | C | `content/classes/` — warrior, ranger, rogue with stats and traits | C2 | Validates |
| **C4** | C | `content/names/` — 200 names per class | C2 | Generated offline, deterministic index at runtime |

**Gate — all of `docs/04-ai-spec.md` §12 must pass.** Rogues claim first, warriors
defend, rangers explore, wounded heroes retreat, cache >80%, null plans <5%.

**Do not start milestone 3 until this gate is met.** Everything downstream assumes the
AI reads as intelligent.

---

## Milestone 3 — Visible

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **C5** | C | `tools/make-placeholders.ts` — all Stage A sprites | — | Idempotent; regenerates identically |
| **C6** | C | `tools/build-atlas.ts` + `frames.gen.ts` typed constants | C5 | Typo in a frame name is a compile error |
| **B6** | B | `render/stage.ts` — 7 layers, sprite pool | C6,B2 | 60fps with 80 sprites |
| **B7** | B | `render/camera.ts` — pan, zoom, bounds clamp | B6 | Feels good on trackpad and touch |
| **B8** | B | `render/interpolate.ts` — tick-alpha interpolation | B6 | No stutter at 10Hz sim / 60Hz render |
| **B9** | B | `ui/HeroInspector.tsx` — **priority, not nice-to-have** | A7,A9 | Shows goal, rivals, parts, plan, history |
| **B10** | B | `ui/Hud.tsx` — treasury, tax slider, population, wave counter | H6 | Reads snapshot only |

**Gate:** you can click a hero and read exactly why it is doing what it is doing.

---

## Milestone 4 — Economy

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A11** | A | `systems/spawning.ts` — guilds, recruit cost, caps, timers | A10 | Caps respected; skipped spawn retried |
| **A12** | A | `systems/economy.ts` — purses, shops, banking, tax, stipend | A11 | Gold conserved; no creation or loss except designed |
| **A13** | A | `systems/construction.ts` — peasants build and repair | A10 | Destructible while building |
| **A14** | A | Tax collector gold-drop on death, lootable | A12 | Rogues pick it up preferentially |
| **B11** | B | `ui/BuildMenu.tsx` — placement, cost preview, validity | B10 | Invalid placement clearly rejected |
| **C7** | C | `content/buildings/` — all 8 with costs and HP | C2 | Validates |

**Gate:** `economy-only` scenario runs 10 minutes unattended without treasury collapse
or runaway inflation.

---

## Milestone 5 — Flags

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A15** | A | `systems/flags.ts` — escrow, claim resolution, refund, 3-hero cap | A12 | Escrow never leaks |
| **A16** | A | `ClaimBounty` goal wired to real flags | A15,A9 | Raising a bounty visibly redirects traffic |
| **B12** | B | `ui/FlagTool.tsx` — place, slider, cancel | A15 | Gold escrowed on confirm |
| **B13** | B | In-world flag rendering with DOM value label | B6 | Legible at all zoom levels |

**Gate:** the §1 story in `docs/01-game-design.md` actually happens in play.

---

## Milestone 6 — Pressure

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A17** | A | Lairs, waves, 5%-per-wave escalation | A11 | Pressure curve emerges without scripting |
| **A18** | A | Monster goal set; goblin henchman-targeting bias | A9 | Goblins attack economy, ratkin attack structures |
| **A19** | A | `systems/fog.ts` — three states, per-hero knowledge | B4 | Heroes cannot path to unknown lairs |
| **A20** | A | Inn knowledge exchange | A19 | Two heroes at inn merge known sets |
| **B14** | B | Fog rendering with remembered-but-stale tint | A19,B6 | Explored ≠ visible, visually |
| **C8** | C | `content/monsters/` + `content/maps/mission-01.ts` | C2 | 96×96, 3 lairs per design doc |

**Gate:** an unattended kingdom eventually loses. Pressure is real.

---

## Milestone 7 — Depth

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A21** | A | `systems/progression.ts` — XP, levels 1–5, stat scaling | A2 | Curve matches design table |
| **A22** | A | Equipment purchase, two slots, `Upgrade` goal | A12 | Heroes visibly get stronger |
| **A23** | A | Building damage states and peasant repair | A13 | Damaged buildings render differently |
| **C9** | C | `tools/fetch-assets.ts` + `assets.manifest.json` | — | SHA-256 verified |
| **C10** | C | `tools/gen-credits.ts` — build fails on missing license | C9 | Verified by a deliberate bad entry |
| **C11** | C | Stage B art integration | C9,C6 | Consistent angle and light across the set |

---

## Milestone 8 — Shippable

| ID | Track | Task | Depends | Done when |
|---|---|---|---|---|
| **A24** | A | Win and lose conditions, mission end state | A17 | Both reachable |
| **B15** | B | End screens, pause, restart | A24 | No dead ends |
| **B16** | B | Damage numbers, death fades, construction dust | B6 | Game feels alive |
| **H8** | H | Balance pass using `economy.spec.ts` sweeps | A24 | All 45 configs viable |
| **H9** | H | Playtest with someone who has never seen it | H8 | They finish without explanation |

**Definition of done:** a stranger plays start to finish, unaided, and afterwards tells
you a story about something a hero did.

---

## Parallelisation

**Milestone 0 is solo.** Fork only after `types.ts` is frozen.

| Phase | Track A (Claude Code) | Track B (Codex) | Track C (Ollama) |
|---|---|---|---|
| M1 | A1, A2 | B1–B5 | C1, C2 |
| M2 | A3–A10 | *(assist B; do not touch AI)* | C3, C4 |
| M3 | *(tune AI against inspector)* | B6–B10 | C5, C6 |
| M4 | A11–A14 | B11 | C7 |
| M5 | A15, A16 | B12, B13 | — |
| M6 | A17–A20 | B14 | C8 |
| M7 | A21–A23 | — | C9–C11 |

**Milestone 2 does not parallelise across the AI itself.** One agent, one head, one
design in mind. Fork around it, never through it.

**Start with two tracks.** Add the third only when Track C's review cost is genuinely
near zero — three agents producing code faster than you can read it is slower than one.

---

## Post-MVP, in likely order

1. Mage class — projectiles, mana, spells, Library
2. Defend and fear flags
3. Save/load from the command log
4. Sound
5. Second and third missions
6. Temples and religion
7. **Multiplayer** — lockstep 1v1, then 2v2. The determinism work is already done; see
   `docs/08-decisions.md` ADR-004.
