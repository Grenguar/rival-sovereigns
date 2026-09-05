# 02 — Architecture

Authoritative. Supersedes all earlier architecture drafts.

---

## 1. Layers

Three layers, strictly one-directional dependency.

```
┌──────────────────────────────────────────────┐
│  ui/        React                            │
│  HUD, build menu, flag tool, hero inspector  │
└───────────────┬──────────────────────────────┘
                │ reads snapshot · emits Command
┌───────────────▼──────────────────────────────┐
│  render/    PixiJS                           │
│  sprites, camera, interpolation, fog, FX     │
└───────────────┬──────────────────────────────┘
                │ reads snapshot + event stream
┌───────────────▼──────────────────────────────┐
│  core/      pure TypeScript                  │
│  world, agents, AI, economy, combat, spatial │
│  ZERO imports from pixi / react / DOM        │
└──────────────────────────────────────────────┘
```

The core's purity is the highest-leverage constraint in the project. It buys:

- Headless test runs — 20,000 ticks in under a second, in CI
- Balance-by-simulation rather than balance-by-playing
- Replay and save/load essentially for free
- A trivial Worker or server migration later, with no rewrite

The core never reads from the renderer. Player input becomes a `Command` on a queue that
the core drains at the start of each tick.

---

## 2. Time

### 2.1 The loop

```ts
const TICK_MS = 100;                 // 10 Hz
let accumulator = 0, last = performance.now();

function frame(now: number) {
  accumulator += now - last;
  last = now;
  accumulator = Math.min(accumulator, TICK_MS * 5);   // no spiral of death

  while (accumulator >= TICK_MS) {
    world.tick();
    accumulator -= TICK_MS;
  }

  renderer.draw(world, accumulator / TICK_MS);        // alpha
  requestAnimationFrame(frame);
}
```

`performance.now` appears here, in `app.ts`, which is **outside** `src/core/`. The core
knows only tick counts.

### 2.2 Tick order

Fixed and never reordered — order is part of the deterministic contract.

1. Drain command queue
2. Sensors (staggered)
3. Goal selection (staggered, plus event-driven interrupts)
4. Planning (staggered, plus invalidation-driven)
5. Action execution (every agent, every tick)
6. Henchman FSMs
7. Movement and pathfinding resolution
8. Combat resolution
9. Economy and construction (1 Hz — every 10th tick)
10. Spawning and wave escalation
11. Flag claim resolution
12. Death, cleanup, respawn timers
13. Fog update
14. Hash accumulation (dev builds only)

---

## 3. Entity model

**Structure-of-arrays-lite, not a full ECS.** A full ECS is correct at 10,000+ entities;
this game peaks near 80 agents plus buildings. Dogmatic ECS would add indirection for
performance we don't need and make the AI code — the interesting part — harder to read.

```ts
type EntityId = number & { readonly __brand: 'EntityId' };

interface Handle { index: number; generation: number; }

interface Entity {
  id: EntityId;
  kind: 'hero' | 'monster' | 'henchman' | 'building' | 'lair' | 'flag' | 'prop';
  faction: FactionId;
  transform: Transform;
  alive: boolean;

  health?: Health;
  agent?: Agent;          // GOAP payload — heroes and monsters only
  fsm?: FsmState;         // henchmen only
  combat?: Combat;
  purse?: Purse;          // personal gold
  building?: Building;
  renderable?: Renderable;
}
```

Entities are held in typed pools and referenced by **generational handles**, never by
object reference. A stale handle is detectable rather than a dangling pointer or a leak.

Systems iterate cached filtered views, rebuilt only on membership change:

```ts
world.views.agents      // agent !== undefined
world.views.combatants  // combat !== undefined && alive
world.views.buildings   // building !== undefined
```

If profiling later demands SoA, the migration is contained because nothing iterates the
raw entity map.

---

## 4. The AI stack

Three tiers at three frequencies. Full specification in `docs/04-ai-spec.md`.

| Tier | Algorithm | Question | Cadence |
|---|---|---|---|
| 1 — Goal selection | Utility scoring | "What do I want?" | ~1 s, staggered + interrupts |
| 2 — Planning | GOAP (backward A*) | "How do I get it?" | on goal change or invalidation |
| 3 — Execution | Action state machines | "Do the next step" | every tick |

**Why not pure GOAP at tier 1.** The question a hero asks most often is *is that bounty
worth the risk, to me?* — a scoring problem. Encoding greed and cowardice into action
costs makes them nearly impossible to tune or explain. Utility answers it natively and
produces a displayable breakdown, which the Hero Inspector needs anyway.

**Henchmen are excluded from this stack.** Peasants, tax collectors and guards use plain
FSMs. No self-interest, no choices, no reason to spend planner time.

---

## 5. Sensors and blackboards

Agents never query world state directly during scoring. That would couple AI cost to
world size and make heroes omniscient, breaking the knowledge design in
`docs/01-game-design.md` §9.

Sensors run on staggered schedules and write to a per-agent blackboard:

```ts
interface Blackboard {
  visibleEnemies: Handle[];
  nearestThreat: Handle | null;
  nearestShop: { market: Handle | null; smith: Handle | null; inn: Handle | null };
  homeGuild: Handle;
  knownLairs: Set<EntityId>;
  knownFlags: FlagKnowledge[];
  currentTarget: Handle | null;
  lastDamageFrom: Handle | null;
  frontierTile: TileCoord | null;
}
```

| Sensor | Period | Cost |
|---|---|---|
| Vision (spatial hash query) | 500 ms | medium |
| Threat assessment | 1 s | low |
| Economic (shop locations, own gold) | 2 s | trivial |
| Frontier (nearest unexplored) | 3 s | medium, rangers only |
| Flag awareness | on event | — |

---

## 6. Spatial

- **Map** — uniform grid, 96 × 96 for mission 01. Tile holds terrain, walkability,
  occupancy, building reference, fog state.
- **Pathfinding** — grid A*, 8-way, octile heuristic. Requests go through a **queue with
  a per-tick budget of ~20 paths**, so a mass reaction never spikes a frame.
- **Flow fields** — precomputed for high-traffic destinations (palace, each guild, each
  shop). Recomputed only on topology change. The single largest pathfinding win here;
  build it at milestone 1, not later.
- **Spatial hash** — 64px buckets, incrementally updated on movement, used for all
  proximity queries.
- **Invalidation** — building placement or destruction bumps `topologyVersion`. Agents
  holding a path across the affected region repath lazily on their next step.
- **Projection** — `src/core/spatial/iso.ts` owns `worldToScreen` / `screenToWorld`.
  It lives in core because depth sorting is deterministic simulation state, not a
  rendering concern.

---

## 7. Performance budget

Target: **80 agents at 10 Hz, ≤5 ms per tick** on a 2021 mid-range laptop, 60 fps
render, ≤120 draw calls.

| System | Budget/tick | Strategy |
|---|---|---|
| Sensors | 0.8 ms | Staggered by period |
| Utility scoring | 0.8 ms | 8 agents/tick round-robin |
| GOAP planning | 1.2 ms | Cache + 150-node budget + event-driven only |
| Pathfinding | 0.8 ms | Request queue, flow fields |
| Movement + combat | 0.7 ms | Straight iteration |
| Economy + construction | 0.2 ms | 1 Hz, not 10 Hz |
| Everything else | 0.5 ms | — |

**Staggering is the primary lever.** No system costing more than ~10 µs per agent may
run for all agents every tick. At 10 Hz with an 8-agent slice, every hero re-evaluates
goals within one second — far below player-perceptible latency.

**No Web Worker in MVP.** At 80 agents it isn't close to necessary, and the boundary
adds snapshot serialisation cost plus debugging friction. The core's purity keeps the
option open at zero cost.

---

## 8. Rendering

- One `Container` per layer: terrain → fog → buildings → ground FX → units → overlays →
  flags
- Terrain baked into `RenderTexture` chunks of 16 × 16 tiles, rebuilt only on change
- Units drawn from a sprite pool over a single atlas
- **Positions interpolated by tick alpha, never by frame delta** — frame-delta movement
  desynchronises visuals from simulation state
- Camera-bounds culling with a one-tile margin
- **All text is DOM.** No Pixi text anywhere; React renders over the canvas.

---

## 9. Commands and persistence

```ts
type Command =
  | { t: 'PLACE_BUILDING'; kind: BuildingKind; tile: TileCoord }
  | { t: 'PLACE_FLAG'; kind: 'attack' | 'explore'; target: Handle | TileCoord; gold: number }
  | { t: 'CANCEL_FLAG'; id: EntityId }
  | { t: 'SET_TAX_RATE'; rate: number }
  | { t: 'DEMOLISH'; id: EntityId };
```

`(seed, commandLog)` is the complete save file. Save/load is out of MVP scope, but the
command log is recorded from milestone 0 because the replay tests depend on it.

---

## 10. Directory layout

```
src/
  core/
    world.ts  types.ts  rng.ts  hash.ts        ← world.ts and types.ts are human-owned
    ai/
      utility.ts  curves.gen.ts  blackboard.ts  sensors.ts
      goap/   state.ts  planner.ts  cache.ts  actions.ts
      fsm/    peasant.ts  taxcollector.ts  guard.ts
    systems/
      movement.ts  combat.ts  economy.ts  construction.ts
      spawning.ts  flags.ts  fog.ts  progression.ts
    spatial/
      grid.ts  astar.ts  flowfield.ts  hash.ts  iso.ts
  content/
    classes/  buildings/  monsters/  names/  maps/
  render/
    stage.ts  camera.ts  sprites.ts  interpolate.ts  fog.ts  fx.ts
  ui/
    Hud.tsx  BuildMenu.tsx  FlagTool.tsx  HeroInspector.tsx
  app.ts
tools/
  gen-curves.ts  make-placeholders.ts  build-atlas.ts
  fetch-assets.ts  gen-credits.ts  render-sprites.py
tests/
  replay.spec.ts  planner.spec.ts  soak.spec.ts  economy.spec.ts  perf.spec.ts
```

---

## 11. Content is data

Classes, buildings, monsters, actions and maps are declarative definitions validated
with `zod` at load. Adding content must not mean adding logic.

The GOAP payoff lives here: adding `PickPocket` as an action with preconditions
`{AT_TARGET, ¬TARGET_DEAD}` and effect `{HAS_GOLD}` immediately makes every high-greed
hero try it, with no change to any decision code.

---

## 12. What this architecture deliberately does not have

Recorded so it isn't re-proposed. Full reasoning in `docs/08-decisions.md`.

| Absent | Why |
|---|---|
| ECS framework | Entity count doesn't justify the indirection |
| Web Worker | Unnecessary at 80 agents; core purity keeps it cheap to add |
| Rust/WASM | Considered seriously; TS chosen for iteration speed (ADR-001) |
| Direct unit control | Contradicts the design premise (ADR-003) |
| Networking | Post-MVP; determinism rules keep lockstep viable (ADR-004) |
| Behaviour trees | Utility + GOAP covers the same ground with tunable data (ADR-002) |
