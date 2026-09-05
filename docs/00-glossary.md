# 00 — Glossary

Three agents working in parallel need the same nouns. Use these terms exactly; do not
introduce synonyms. If a concept is missing here, add it rather than inventing a local
name in your own track.

---

## Simulation

**Tick** — one logical simulation step. Fixed at 100 ms (10 Hz). The unit of all
in-sim timing. Never use wall-clock time inside `src/core/`.

**Frame** — one render pass, at display refresh rate. Frames are decoupled from ticks;
rendering interpolates between the last two tick states.

**Alpha** — the interpolation factor `0..1` between the previous and current tick,
passed to the renderer each frame.

**Command** — the only way player intent enters the simulation. A serialisable value
(`PLACE_BUILDING`, `PLACE_FLAG`, `SET_TAX_RATE`, `CANCEL_FLAG`). Drained from a queue
at the start of each tick.

**Command log** — the ordered list of all commands with their tick numbers. Together
with the seed it fully reproduces a session.

**Snapshot** — a flat, render-facing view of world state for one tick. Read-only from
the renderer's perspective.

**State hash** — an FNV-1a hash over the canonical world state, used to detect
divergence between runs. The determinism canary.

**Golden replay** — a checked-in `(seed, command log, expected hash at tick N)` triple
that CI verifies on every engine.

---

## Entities

**Entity** — anything in the world with a position: heroes, monsters, henchmen,
buildings, lairs, flags, props.

**Agent** — an entity that makes decisions. Covers **heroes** and **monsters**. Does
*not* cover henchmen, which are FSM-driven and deliberately not agents.

**Hero** — an autonomous, named, levelling unit belonging to the player's kingdom.
Never directly controllable. Owns personal gold.

**Henchman** — a non-heroic unit: **peasant**, **tax collector**, or **guard**. Numbered
rather than named, auto-replaced on death, driven by a finite state machine.

**Monster** — a hostile agent spawned by a lair. Uses the same AI stack as heroes with
different goal weights.

**Lair** — a destructible enemy structure that spawns monsters on a timer. Destroying
all lairs wins the mission.

**Wave** — one spawn event from a lair. Wave number drives escalation.

**Handle** — a generational index identifying an entity (`{index, generation}`). Used
instead of object references so stale handles are detectable.

---

## AI

**Goal** — a desired world state with a utility score. Heroes pick one goal at a time.
Examples: `Survive`, `ClaimBounty`, `Explore`.

**Consideration** — one scored input contributing to a goal's utility. Has an input
function, a curve, and a weight.

**Curve** — a 256-entry integer lookup table mapping `0..1` to `0..1`. Replaces
exponent math, which is banned. See `docs/03-determinism.md`.

**Trait** — a per-hero personality value: `greed`, `courage`, `curiosity`, `loyalty`.
Selects and blends curve variants; never a code branch.

**Incumbency bonus** — the 15% score bonus given to the currently active goal to
prevent oscillation between near-equal options.

**Symbol** — one boolean fact in the planning state (`HAS_GOLD`, `AT_TARGET`). Stored
as a bit in a 32-bit field.

**World state (planning)** — `{values, mask}`, two 32-bit fields. `values` holds symbol
truth, `mask` marks which symbols the state constrains. Distinct from the *world*,
which is the whole simulation.

**Action** — an executable step with symbolic preconditions, effects, a dynamic cost,
and a runtime state machine. The vocabulary the planner searches over.

**Plan** — an ordered list of actions produced by the planner that reaches a goal state.

**Planner** — backward A* from the goal state toward the current state, budgeted at 150
node expansions.

**Regression** — applying an action *backwards* during search: given a desired state,
compute the state required before the action.

**Blackboard** — per-agent scratch memory holding non-symbolic context: current target,
nearest shop, known lairs. Written by sensors, read by actions.

**Sensor** — a scheduled function that observes the world and writes to a blackboard.
Agents never query the world directly during scoring.

**Stagger** — spreading a per-agent system across ticks (`agentId % N`) so it never runs
for every agent on the same tick.

**Replan** — discarding the current plan and running the planner again. Triggered by
action failure, symbol flips, goal change, or a 5 s ceiling.

---

## Gameplay

**Treasury** — the player's gold. Distinct from hero gold.

**Hero gold** — a hero's personal purse. Spent at player-owned shops, banked at the
home guild, taxed by tax collectors.

**Guild vault** — gold banked at a guild by its heroes. The thing tax collectors take a
cut of.

**Flag** — a placed bounty. Two kinds: **attack flag** (bounty on an enemy unit or
structure) and **explore flag** (bounty on a map tile).

**Bounty** — the gold attached to a flag. Escrowed from the treasury on placement,
refunded on cancel, paid to whichever hero satisfies it.

**Tax rate** — player-set percentage `0..50` taken from guild vaults by tax collectors.
Also reduces effective hero loyalty.

**Knowledge** — a hero's personal set of known lairs and flags. Heroes are not
omniscient; knowledge spreads when heroes meet at the **Inn**.

**Fog state** — per tile: `unseen`, `explored` (remembered but stale), or `visible`.

---

## Rendering

**Dimetric 2:1** — the projection. A tile occupies 64 × 32 screen pixels.

**Facing** — one of 8 compass directions a unit sprite can face. Stored as 4 rendered
facings, horizontally mirrored to 8.

**Atlas** — the packed sprite sheet plus its PixiJS JSON frame map.

**Frame name** — `{subject}_{action}_{facing}_{index}`, e.g. `warrior_walk_ne_02`.

**Layer** — a render container. Order: terrain → fog → buildings → ground FX → units →
overlays → flags.

**Depth sort** — units and buildings sorted by `(x + y)`, tie-broken by entity id so
the order is deterministic.

---

## Process

**Track** — a parallel work stream owned by one agent. A = AI core, B = spatial and
render, C = tooling and content.

**Stage A/B/C art** — procedural placeholders / CC0 packs / Blender-rendered. See
`docs/05-art-bible.md`.

**Soak test** — a long headless simulation run asserting invariants rather than exact
values.
