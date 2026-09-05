# 08 — Decision Log

Read this before proposing an architectural change. Most obvious improvements were
considered and rejected for reasons recorded here.

Format: context, decision, consequences, and what would justify revisiting.

---

## ADR-001 — TypeScript, not Rust/WASM

**Status:** accepted

**Context.** The core needs cross-engine deterministic float math. WASM specifies IEEE-754
arithmetic exactly, and Rust compiles libm's transcendentals *into the module*, so
`powf` is your own deterministic code rather than the host engine's. That is a genuine
advantage over JavaScript, where `Math.pow` and the trig functions are
implementation-defined.

**Decision.** TypeScript for everything, with the determinism achieved by discipline
(`docs/03-determinism.md`) instead of by the platform.

**Why.** Iteration speed dominates at this stage. Milestone 2 is AI tuning — dozens of
small adjustments checked by feel — and Vite HMR against a seconds-long Rust rebuild is
a large multiplier on the riskiest part of the project. The entity-cross-reference
patterns this game needs also fight the borrow checker, which is where Rust game
projects most often lose weeks.

**Consequences.** Banned-function list, curve LUTs instead of exponents, squared distance
comparisons, direction tables instead of trig. Roughly a day of upfront cost, then near
zero.

**Revisit if.** Profiling shows the sim is CPU-bound at target agent counts, or
multiplayer ships and cross-engine desyncs appear despite the lint rules. The port is
contained: `src/core/` is already dependency-free, and the golden replay tests transfer
unchanged — you can even differential-test both cores against the same command log.

---

## ADR-002 — Utility AI for goals, GOAP for plans

**Status:** accepted

**Context.** Options were pure GOAP, pure utility AI, behaviour trees, or a hybrid.

**Decision.** Utility scoring selects the goal; GOAP plans the route; action state
machines execute.

**Why.** The question a hero asks most often — *is that bounty worth the risk, to me?* —
is a scoring problem, not a planning problem. Expressing it in GOAP means encoding greed
and cowardice into action costs, where they become nearly impossible to tune or explain.
Utility answers it natively and produces a displayable breakdown, which the Hero
Inspector needs anyway.

GOAP earns its place one level down, where the question genuinely is multi-step: *I want
a potion, I have no gold, the shop is across the map, and there's a goblin on the route.*

**Consequences.** Two systems to maintain. Traits become curve-variant selectors rather
than code branches, which is why four numbers produce all the class personality.

**Revisit if.** Goal count exceeds ~15 and the scoring interactions become unpredictable.

---

## ADR-003 — No direct unit control

**Status:** accepted; a champion layer was proposed and rejected

**Context.** A directly-controlled champion (Warcraft III style) was proposed to solve a
competitive-fairness problem: in PvP, "my hero ignored my base and I lost" feels unfair
in a way it never does against the environment.

**Decision.** No direct control of anything, ever. The champion layer is dropped.

**Why.** Unpredictability is the product, not an obstacle to it. Adding a directly
controlled unit gives the player somewhere to put their attention that isn't the
incentive system, and the incentive system is the game. The fairness problem it solved
belongs to a multiplayer mode that doesn't exist yet, and ADR-006's free-agent model
addresses it differently when it does.

**Consequences.** Every player action is economic or architectural. The Hero Inspector
becomes essential rather than optional — with no direct control, legibility is the only
thing standing between "alive" and "broken".

**Revisit if.** Playtesting shows players cannot form intent at all. Note this is
different from players being frustrated — frustration when a hero refuses is the design
working.

---

## ADR-004 — Deterministic core, lockstep-ready

**Status:** accepted

**Context.** Determinism has real cost: banned functions, LUT curves, explicit sort
orders, cross-engine CI.

**Decision.** Full determinism from milestone 0, even though MVP is single-player.

**Why.** Three of the four benefits apply immediately and have nothing to do with
networking: headless soak testing, balance-by-simulation, and replay-based bug reports.
For a game whose value proposition is emergent behaviour, being able to reproduce "the
hero did something weird at tick 8,400" exactly is close to essential.

The fourth benefit — lockstep multiplayer sending only commands — is free if built in now
and prohibitively expensive to retrofit, since it would mean revisiting every calculation
in the game.

**Consequences.** See `docs/03-determinism.md`. Roughly a day of setup, then discipline.

**Revisit if.** Never. Even if multiplayer is abandoned, points 1–3 justify it alone.

---

## ADR-005 — FSMs for henchmen, GOAP for heroes

**Status:** accepted

**Context.** Consistency argues for one AI system for every unit.

**Decision.** Peasants, tax collectors and guards use plain finite state machines.
Heroes and monsters use the three-tier stack.

**Why.** Henchmen have no self-interest and no choices worth searching over. A peasant
walks to a site and builds; a tax collector visits guilds and returns. Planning would
spend CPU producing behaviour a 30-line FSM produces identically. It also keeps henchmen
cheap enough to be numerous, which matters because they are the goblins' preferred prey.

**Consequences.** Two behaviour systems. The boundary is clear: *does this unit have
self-interest?*

**Revisit if.** Henchmen gain meaningful choices — for example, a tax collector deciding
between routes based on perceived danger.

---

## ADR-006 — Two flag types, not four

**Status:** accepted

**Context.** The genre's original entry shipped attack and explore flags. Its sequel
added defend and fear.

**Decision.** MVP ships attack and explore only.

**Why.** Flag variety and economic depth compete for the same development time, and the
economy is where the strategy lives. Two flags with a working circulation model
(`docs/01-game-design.md` §3) is a better game than four flags without one. Defend
partially duplicates the `DefendHome` goal that warriors already have natively.

**Consequences.** Fewer player verbs; more pressure on bounty *pricing* to be
interesting. The 3-hero claim cap exists because with only two flag types, a large
bounty otherwise pulls the whole kingdom into one corner.

**Revisit if.** Playtesters consistently want to say something the two flags cannot
express. Fear is the likely first addition.

---

## ADR-007 — Procedural placeholders before real art

**Status:** accepted

**Context.** Real art is more motivating to work on than coloured capsules.

**Decision.** All sprites are procedurally generated by a script through milestone 6.
Real assets arrive at milestone 7.

**Why.** Sprite dimensions will change three or four times during milestones 2–5, and
each change is free when the art is a script rather than a folder of PNGs. Procedural
placeholders are also consistent by construction — one palette, one generator, one camera
convention — which is the property that free asset packs most often lack.

Stage A output is deliberately *shippable*. If the project stalls, it still looks
intentional rather than unfinished.

**Consequences.** The game looks abstract for months. Accept this; it is the correct
trade.

**Revisit if.** Motivation genuinely depends on visual progress. That is a legitimate
reason for a solo project, and pulling C11 forward is cheaper than abandoning.

---

## ADR-008 — Entity pools, not an ECS framework

**Status:** accepted

**Context.** ECS is the default answer for game entity management.

**Decision.** Plain objects in typed pools with optional components, referenced by
generational handles. Cached filtered views for iteration.

**Why.** A full archetype ECS is correct at 10,000+ entities. This game peaks near 80
agents plus buildings and props. Dogmatic ECS would add indirection and iteration
ceremony for performance we do not need, and would make the AI code — the part that is
actually hard — harder to read.

**Consequences.** If profiling later demands structure-of-arrays, the migration is
contained, because nothing iterates the raw entity map.

**Revisit if.** Agent count target rises above ~500, which would only happen for
multiplayer at scale.

---

## ADR-009 — No Web Worker in MVP

**Status:** accepted

**Context.** The core is pure and could move to a Worker with no rewrite.

**Decision.** Main thread only, for now.

**Why.** At 80 agents with staggered systems the budget is ~5 ms per tick at 10 Hz — not
close to needing a Worker. The boundary adds snapshot serialisation cost and materially
worse debugging. Core purity means the option stays available at zero ongoing cost, which
is the point of keeping it.

**Revisit if.** Tick cost exceeds 8 ms at target agent count, or multiplayer raises the
per-client simulation load (in lockstep, every client simulates *all* players' agents —
2v2 at 80 each is 320 on every machine).

---

## ADR-010 — Three hero classes in MVP

**Status:** accepted

**Context.** Four classes were wanted: warriors, elves, mages, thieves.

**Decision.** Warrior, Ranger and Rogue ship in MVP. Mage is the first post-MVP
addition.

**Why.** Mage requires projectile logic, mana, a spell system and a Library building — a
whole vertical of work that demonstrates nothing the other three do not. The trio already
covers the full behavioural spread the design needs: brave/loyal, curious/independent,
greedy/cowardly. If those three read as visibly different personalities in play, the AI
works and every further class is content rather than engineering.

**Consequences.** Less variety at launch. The rock-paper-scissors dynamic the genre uses
is thinner with three classes.

**Revisit if.** Milestone 2's gate passes early and comfortably. Mage is then cheap.
