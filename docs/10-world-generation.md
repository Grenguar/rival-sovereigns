# 10 — World generation, maps and points of interest

Status: **proposal**. Nothing here is implemented. It is written to be argued with, then
sliced into `docs/07-backlog.md` rows.

Scope: how terrain, roads, caves, destructible sites and points of interest come into
existence; what the solo campaign's maps are; and how the Catalan framing lands in
content without touching the determinism contract.

---

## 1. The constraint that shapes everything

`docs/01-game-design.md` §10 rejects procedural generation, and it is right:

> Procedural generation makes balance testing noisier at exactly the moment you're
> balancing.

`tests/economy.spec.ts` sweeps 90 configurations over 20,000 ticks each. If the terrain
moves between runs, every result carries map variance and the sweep stops meaning
anything.

**This document does not overturn that.** It proposes the opposite of runtime
generation:

> **Generation is an offline authoring tool. Its output is a committed artifact.**
> `tools/gen-map.ts` turns a seed and a design brief into a `MissionMap`, which is
> checked into `src/content/maps/` as data. The runtime never generates. A designer
> re-rolls a seed, reads the report, hand-edits the result, and commits it.

This buys the variety of a generator and keeps the fixed maps balance requires. It also
matches how `pregen` already works: `tools/` produces committed artifacts, the game
consumes them. The idempotence contract in `docs/09-two-agent-protocol.md` §2 extends to
maps unchanged.

---

## 2. What is broken today

The current map has **two unlinked sources of truth**, and they disagree.

`src/content/maps/mission-01.ts` owns terrain and a `landmarks` array.
`src/core/scenario.ts` owns `MissionSpec`, which independently hardcodes the same
positions. Nothing checks they match. They do not:

| Thing | `MissionMap` landmark | `MissionSpec` placement | Terrain actually under the spec tile |
|---|---|---|---|
| Palace | (40, 54) | (40, 52) | **road** |
| Ratkin Warren A | (56, 38) | (58, 36) | grass |
| Ratkin Warren B | (19, 75) | (20, 72) | **forest** |
| Goblin Camp | (86, 54) | (86, 50) | **forest** |

Verified by probing `terrainAt()` at every authored placement. Consequences:

- **The endgame objective is inside a forest.** The clearing carved for the goblin camp
  is at (86, 54); the camp spawns at (86, 50). The ford road leads to the clearing, not
  to the camp. §10's "past the river" climax approaches a hole in the trees next to the
  thing it is meant to approach.
- **Warren B is in forest too**, so §10's "open ground, punishes ignoring the south"
  is not what the map does.
- **Three structures sit on road tiles** — the palace, the inn and one guardhouse.

None of this is fatal today because terrain does not yet block movement or placement for
lairs. It becomes fatal the moment it does. Every rule below exists to make this class
of bug impossible rather than to patch these four instances.

---

## 3. The map contract

### 3.1 One source of truth

`MissionMap` absorbs `MissionSpec`. The map owns terrain, landmarks, **and** the initial
building layout. `createScenario` reads placements from the map it was handed. There is
no second table to drift.

```
MissionMap
  id, width, height
  terrain[]                     width * height
  regions[]                     NEW — region id per tile, for generation and display
  landmarks[]                   lairs, caves, ruins, POIs — everything the sim spawns
  startingBuildings[]           was MissionSpec.buildings
  clearBuildRadius
  brief                         NEW — the generator inputs, kept for reproducibility
```

`brief` matters: it makes a committed map re-derivable. Without it, a map is a wall of
9,216 terrain values nobody can revise.

### 3.2 Validation that would have caught all four bugs

A `tests/maps.spec.ts` that runs over **every** committed map:

| Rule | Why |
|---|---|
| Every landmark and starting building sits on terrain its footprint permits | catches the forest camp and the road palace |
| Every lair has a walkable approach from the palace | a lair nothing can reach is not content |
| Every lair's clearance ring is centred on the lair's own tile | the carve and the spawn cannot diverge |
| No two footprints overlap, gap rule from `content/buildings/placement.ts` honoured | reuses the existing rule instead of restating it |
| Terrain histogram inside declared bounds per region | catches the "95.6% grass" failure automatically |
| Reachability: every POI reachable, or explicitly flagged `unreachable: true` | islands are a decision, not an accident |

This is the single highest-value item in this document. It is a few hours of work and it
converts an entire class of silent content bug into a red test.

---

## 4. Terrain generation

### 4.1 Why the current output reads as wallpaper

`mission-01.ts` applies two noise fields **uniformly across the whole map**. Uniform
noise has no regions, so every part of the map looks like every other part. Woodland at
(10, 10) is indistinguishable from woodland at (80, 80). Exploration reveals more of the
same, which is why revealing it feels like nothing.

Real landscape has a *gradient*. Catalonia's is unusually legible and runs coast →
interior: a narrow coastal plain, then the pre-coastal range (Garraf, Montserrat,
Prades, Montsant), then the interior plains of Urgell and Segarra, then the Pyrenean
foothills. Rivers cut across the grain, and settlement follows the rivers and the passes.

### 4.2 The band model

Generate a **region field first**, terrain second.

1. **Axis.** Pick a coast direction. Compute a normalised distance-from-coast per tile,
   perturbed by low-frequency noise so the bands are not stripes.
2. **Bands.** Threshold that field into regions: `marina` (coastal), `plana` (plain),
   `serra` (range), `alta` (high country). A map need not contain all four — `El Congost`
   is `serra` only.
3. **Hydrology.** Rivers start in the highest band and run downhill to the coast edge by
   steepest descent on the region field, widening as they accumulate. This produces
   fords and confluences as a *consequence* rather than a hand-placed rectangle.
4. **Relief.** Rock density is a function of band, not a global constant: heavy in
   `serra`, near zero in `plana`.
5. **Vegetation.** Also band-conditioned. Aleppo pine and scrub in `marina`; holm oak on
   the range; cultivated grass, vineyard and olive in `plana`. Codex's art plan already
   asks for six grass variants and four earth variants — the band field is what decides
   which one a tile gets, so the variants carry information instead of being noise.
6. **Roads.** **Least-cost paths, not rectangles.** Build a cost grid (road cheap, grass
   cheap, forest dear, rock dearer, water very dear but passable at the narrowest span),
   then run the existing A* between the consell and each settlement or landmark. Fords
   emerge where crossing is cheapest, which is exactly what a ford is. This deletes the
   hand-tuned `rectangle(66, 54, 8, 2, 'road')` calls and the class of bug where the road
   goes to the wrong place.
7. **Siting.** Place landmarks by constraint satisfaction, not by literal coordinates:
   *"a ratkin warren, 20–24 tiles from the consell, in `plana`, with light forest cover
   on the approach, at least 15 tiles from any other lair."* The generator solves it and
   reports what it chose. This is how a brief survives a re-roll.
8. **Clearance and validation.** Carve using the sited positions — the same array the
   sim will spawn from — then run §3.2. A brief that cannot be satisfied fails loudly.

### 4.3 Determinism

The generator runs under `tools/`, which is outside the ESLint determinism gate. That is
fine: it is offline. But its **output** must be byte-stable for the same brief, or map
regeneration produces spurious diffs and the `pregen` idempotence contract breaks. So the
generator uses the same integer-hash noise discipline as `mission-01.ts` today, and gets
the same treatment as every other generator: run twice, expect a fixed point.

---

## 5. Caves, ruins and points of interest

Today the only map feature is a lair, and a lair is an omnidirectional blob that spawns
monsters. Three new landmark families, each with a distinct mechanical shape.

### 5.1 Avencs — caves

Catalan karst is full of *avencs*: vertical shafts and potholes, thick in Garraf and
around Montserrat. The mechanically interesting property is that a shaft has **one way
in**.

> A cave lair has a footprint **and a separate entrance tile**. Approach, combat and
> line of sight all resolve at the entrance.

That is a real difference from a surface camp, not a reskin:

- It is a chokepoint. Two heroes at the mouth hold what six would need in the open.
- It makes the guardhouse meaningful offensively — a tower near a mouth caps what comes
  out.
- It gives rangers a role: the approach corridor is where ranged attacks pay.
- Fog behaves differently — you can see the mouth without knowing the depth. A cave has a
  *depth* the player learns only by sending someone in, which is genuine information
  asymmetry and a reason to pay for scouting.

Proposed: `LairKind` gains `avenc`. `Lair` gains `entrance: TileCoord` and `depth: number`,
where depth scales wave size and reward. Surface lairs set `entrance` to their own tile,
so the existing behaviour is the degenerate case and nothing branches.

### 5.2 Ruins — the buildings to destroy

The player asked for buildings to destroy. Lairs are not buildings; they are spawners.
A separate family:

| Site | State | Player options |
|---|---|---|
| `masiaCremada` — burnt farmstead | occupied | clear it (bounty), then **restore** it for a standing tax yield |
| `torreAbandonada` — abandoned watchtower | occupied | clear, then restore as a free guardhouse post with wide sight |
| `moli` — river mill | occupied | clear, then restore for a market-revenue multiplier |
| `ermita` — hermitage | derelict | restore only; no fight. A sanctuary heroes rest at |

Each carries the four condition states Codex's art plan already specifies —
`construction` / `intact` / `damaged` / `rubble` — so the art pipeline needs no new
concept, only new subjects.

The decision this creates is the interesting part, and it is the same decision the whole
game is about: **a ruin is a bounty you pay for twice.** Once to clear it, once to
restore it. Restoration competes with guilds for treasury. That is an economic choice
under the same pressure as everything else, and it gives the map a reason to be
*occupied* rather than merely traversed.

### 5.3 Points of interest — the non-combat map

Majesty's map is combat-only. Ours does not have to be. Small, cheap, mostly passive:

| POI | Effect |
|---|---|
| `font` — spring | slow heal while adjacent; heroes route through when hurt |
| `creuDeTerme` — boundary cross | marks a jurisdiction edge; see §7 |
| `barraca` — dry-stone hut | shelter; a hero waits out a night here instead of walking home |
| `dolmen` | one-time knowledge: reveals a map region on first visit |
| `fira` — periodic market | a marketplace that appears on a cycle; trade income spike |

These matter because they give the AI's existing utility scoring more to weigh. Right now
a hero's world is guild, market, inn, lair. Add a spring and "wounded" starts producing
different behaviour from "poor". That is more emergence for very little code — the goal
and consideration machinery already exists.

---

## 6. The Catalan layer, without breaking the hash

### 6.1 Runtime IDs do not change

The renaming table is a **display layer**, not a rename. `palace` stays `palace` in
`BuildingKind`, in the content schemas, in the atlas frame names, and in Codex's art
plan which already keys on those IDs. Renaming the union would move the golden replay
hash, invalidate every frame name in `frames.gen.ts`, and collide with in-flight art
work — for zero player-visible gain over a lookup table.

> `src/content/display/ca.ts` maps runtime ID → display name, one-line description, and
> the folkloric note. The UI reads it. The simulation never does.

This also leaves room for English display names later without a second migration.

| Runtime ID | Display | Note |
|---|---|---|
| `palace` | **Consell** | a council house, not a throne room |
| `warriorsGuild` | **Confraria dels Almogàvers** | *Desperta ferro!* |
| `rangersLodge` | **Confraria dels Ballesters** | Catalan crossbowmen |
| `roguesGuild` | **Confraria dels Bandolers** | Rocaguinarda, Serrallonga |
| `inn` | **Hostal** | |
| `blacksmith` | **Ferreria** | |
| `guardhouse` | **Torre de guaita** | |
| `marketplace` | **Mercat** | |
| `warrior` | **Almogàver** | ferocious, ungovernable |
| `ranger` | **Ballester** | |
| `rogue` | **Bandoler** | |
| future `library` | **Estudi General** | Lleida, founded 1300 |
| future `arena` | **Plaça** | where castellers train |

### 6.2 The bestiary documents itself

The strongest idea in the brief: **festival figures are commemorations of real events.**
Every beast paraded through a Catalan town exists in-world because that thing came, once.

Mechanically, this is a codex that writes itself. First time the player destroys a lair
type, that creature enters the **Llibre de les Bèsties** with an entry written as a
municipal record of the festival that commemorates it. No exposition dump, no lore
codex nobody reads — the entry is earned and it is the *reward text* for a real
achievement.

Candidate roster, drawn from what people actually believed rather than from D&D:

| Runtime | Display | Source | Mechanical hook |
|---|---|---|---|
| `ratkin` | **Rates-pinyades** | | the tutorial swarm |
| `goblin` | **Follets** | household spirits, mischievous | steal from buildings rather than destroy |
| `goblinRaider` | **Diables** | correfoc devils | fire; damage buildings over time |
| new | **Cuca Fera** | the festival beast itself | a slow, enormous lair boss; a walking siege |
| new | **Dip** | a blood-drinking dog of Pratdip | fast, drains, flees to heal — a hunter |
| new | **Bruixa** | | buffs a lair; kill her first or the lair keeps growing |
| new | **Comte Arnau** | see §6.4 | not spawned by a lair at all |

### 6.3 Minairons — the folklore that is already a mechanic

Tiny beings kept in a *canut* (needle case) who work at superhuman speed but must
constantly be given tasks or they turn destructive.

This is a **tempo resource**, and it is the sharpest new mechanic available:

- Release minairons and construction completes far faster than peasants manage.
- The build queue must never empty. An idle minairon damages the nearest building.
- So the player is pushed to keep building — which means keeping the treasury spent,
  which means raising tax, which costs loyalty.

It couples directly to the tax slider and gives the henchman layer a personality instead
of a labour statistic. It also fits the existing architecture exactly: henchmen already
run FSMs (`ADR-005`), and "idle → seek nearest building → damage" is one more state.

The failure mode is legible and the player's own fault, which is the best kind.

### 6.4 El Comte Arnau — misgovernment as a lose condition

A damned lord condemned to ride eternally on a flaming horse; in the common strand of the
legend, for withholding wages from his workers.

In a game whose entire loop is paying people who can refuse you, he is the natural
antagonist. Make him **emergent, never scripted**, driven by a grievance ledger:

| Grievance | Weight |
|---|---|
| A bounty cancelled after a hero committed to it | high |
| A hero died while a bounty they had claimed went unpaid | high |
| Tax sustained above a threshold across a long window | medium, accumulating |
| Treasury hoarded while heroes are unpaid and unequipped | medium |
| A building left in `rubble` — the county visibly ungoverned | low, accumulating |

Cross the threshold and Arnau rides: a single, unkillable-by-normal-means threat that
targets *the consell itself*, not the frontier. He is not defeated by force but by
settlement — pay the debt, at a price that hurts.

This is the *pactisme* thesis made mechanical. **"E si no, no"** — and if not, not. The
sovereign's power is contractual; break the contract and the contract breaks you. It is
the same design premise as heroes refusing a bounty, escalated to a loss condition, and
it means the game can be lost by governing badly rather than only by fighting badly.

It also gives the reputation model a face, which is the thing reputation systems usually
lack.

---

## 7. Jurisdiction — what the Catalan framing does to the map itself

A consequence of *pactisme* worth taking seriously, because it changes the map from a
threat field into something no comparable game has.

> The map is divided into **jurisdictions**. Your writ runs inside your own; outside it,
> you can only offer money.

- Inside your jurisdiction: build freely, collect tax, guards patrol.
- Outside: no building, no tax — but bounties still work, because a bounty is a contract
  with a free person and needs no territorial authority. This is *exactly* the design
  thesis, expressed as a map rule.
- Jurisdiction expands by charter, not conquest: reach a Charter level, or restore an
  `ermita`, or settle terms with a free town.
- `creuDeTerme` boundary crosses mark the edges — a real Catalan landscape feature doing
  a real UI job. The player reads the border from the world instead of from an overlay.

It gives exploration a second meaning beyond fog: you can *see* land you may not yet
*use*. And it gives the mid-game a goal that is neither combat nor economy but
constitutional.

Flagged as the most speculative proposal here. It is a large change and should be
prototyped on one map before it becomes a pillar.

---

## 8. The solo campaign

Four maps. Each teaches one axis and each is a *place*, not a difficulty tier.

| # | Map | Regions | Teaches | New content |
|---|---|---|---|---|
| 1 | **La Vall** — the valley | `plana` | the loop: build, bounty, tax, defend | existing Mission 01, corrected per §2 and reskinned |
| 2 | **El Congost** — the gorge | `serra` | chokepoints and approach | first `avenc`; ruins to clear and restore |
| 3 | **La Marina** — the coast | `marina`, `plana` | trade income, a second economy | `fira` markets; sea-raider lair with no fixed camp |
| 4 | **La Serra** — the range | `serra`, `alta` | governing under pressure | minairons; the Arnau grievance ledger |

Mission 1 ships first and is mostly a bug-fix plus a display layer, so it validates the
pipeline cheaply. Mission 2 is the first map the generator authors end to end and is the
real test of §4. Missions 3 and 4 each carry one new pillar and should not start until
that pillar has a headless balance sweep.

Win conditions should stop being "destroy all lairs" by Mission 3. *La Marina* wants a
trade threshold; *La Serra* wants survival with an intact charter. Same simulation,
different objective — which is what makes a campaign rather than a difficulty ramp.

---

## 9. Ordering

Strictly by risk. Nothing later depends on a guess made earlier.

| Step | Work | Gate |
|---|---|---|
| **W1** | `tests/maps.spec.ts` — §3.2 validation over existing maps | fails on today's map, naming all four defects |
| **W2** | Merge `MissionSpec` into `MissionMap`; fix the four defects | W1 green; golden replay hash moves once, deliberately, in this commit |
| **W3** | `src/content/display/ca.ts` + UI wiring | no runtime ID changed; hash unmoved |
| **W4** | `tools/gen-map.ts` — bands, hydrology, cost-path roads, constraint siting | regenerates Mission 01's brief to a playable map; run twice, byte-identical |
| **W5** | POIs (§5.3) — `font`, `dolmen`, `barraca` | heroes visibly reroute; economy sweep unchanged within tolerance |
| **W6** | `avenc` caves — entrance tile, depth | Mission 2 authored and winnable headlessly |
| **W7** | Ruins — clear and restore | restoration competes with guilds in the economy sweep |
| **W8** | Minairons | build tempo shifts measurably; idle damage is survivable and legible |
| **W9** | Bestiary codex + festival entries | first kill of each type produces an entry |
| **W10** | Arnau grievance ledger | a deliberately abusive sweep configuration triggers him; a fair one never does |
| **W11** | Jurisdiction (§7) — prototype on one map only | decide whether it becomes a pillar |

W1–W3 are corrective and cheap and should go first regardless of what happens to the
rest of this document.

---

## 10. Open questions

These need a human decision; the plan branches on them.

1. **Does terrain block movement?** Currently it does not. Caves, chokepoints, fords and
   jurisdiction all assume it does. This is the largest single dependency here and it
   moves the golden hash.
2. **Catalan-only display, or bilingual?** A Catalan-only UI is a stronger identity and a
   real accessibility cost. §6.1's lookup table supports either; the question is what
   ships.
3. **Is jurisdiction (§7) a pillar or a flourish?** It is the most original idea in this
   document and the most expensive.
4. **Does Arnau end the run, or tax it?** A loss condition is dramatic; a permanent
   penalty is kinder and probably more instructive.
5. **How much folklore load can the game carry** before a player with no Catalan context
   is lost? The festival-commemoration framing is self-explaining, which is what makes it
   the safest of the folkloric ideas.

## 11. What this document deliberately does not do

- It does not move runtime generation into the game. §1.
- It does not rename any runtime identifier. §6.1.
- It does not touch `src/core/types.ts` or `src/core/world.ts`; every type change above is
  a proposal for a human, per `docs/AGENTS.md` §3.
- It does not contradict `art/CATALAN-ART-AND-UI-PLAN.md`. That plan owns visual grammar,
  palette and the art pipeline; this one owns map structure and content mechanics. Where
  they touch — building roster, terrain variants, region palettes — this document defers.
