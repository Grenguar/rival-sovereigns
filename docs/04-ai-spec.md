# 04 — AI Specification

Implementation spec for Track A. This is the heart of the game; everything else is
support.

---

## 1. Structure

```
┌──────────────────────────────────────────────────────────┐
│ TIER 1 — GOAL SELECTION            utility scoring       │
│ "What do I want right now?"                              │
│ Every ~1 s, staggered 8 agents/tick, + event interrupts  │
├──────────────────────────────────────────────────────────┤
│ TIER 2 — PLANNING                  GOAP, backward A*     │
│ "What sequence gets me there?"                           │
│ On goal change or plan invalidation only                 │
├──────────────────────────────────────────────────────────┤
│ TIER 3 — EXECUTION                 action state machines │
│ "Do the next step, check it still holds"                 │
│ Every tick, every agent                                  │
└──────────────────────────────────────────────────────────┘
```

Heroes and monsters use all three tiers. **Henchmen use none of it** (§8).

---

## 2. Planning state

Symbolic, boolean, 32-bit. Non-boolean context (*which* target, *which* shop) lives on
the blackboard — keeping the planning space boolean is what keeps A* fast.

```ts
export const enum S {
  HAS_GOLD          = 1 << 0,   // gold >= class spend threshold
  AT_TARGET         = 1 << 1,
  TARGET_DEAD       = 1 << 2,
  TARGET_KNOWN      = 1 << 3,
  IS_INJURED        = 1 << 4,   // hp < 50%
  IS_CRITICAL       = 1 << 5,   // hp < 25%
  HAS_POTION        = 1 << 6,
  AT_MARKET         = 1 << 7,
  AT_SMITH          = 1 << 8,
  AT_INN            = 1 << 9,
  AT_HOME_GUILD     = 1 << 10,
  THREAT_NEARBY     = 1 << 11,
  BOUNTY_KNOWN      = 1 << 12,
  LAIR_KNOWN        = 1 << 13,
  UPGRADE_AVAILABLE = 1 << 14,
  IS_RESTED         = 1 << 15,
  SAFE              = 1 << 16,
}

export interface State { values: number; mask: number; }

export const satisfies = (cur: State, goal: State): boolean =>
  (cur.values & goal.mask) === (goal.values & goal.mask);
```

`mask` marks which symbols a state constrains; `values` holds their truth. Both
satisfaction and hashing are single-instruction operations.

---

## 3. Actions

Sixteen actions cover the entire MVP.

```ts
interface ActionDef {
  id: ActionId;
  pre: State;
  eff: State;
  classes: ClassId[] | 'all';
  cost(agent: Agent, w: World): number;
  isValid(agent: Agent, w: World): boolean;   // contextual gate, checked during search
  bind(agent: Agent, w: World): boolean;      // resolve target onto blackboard
  runtime: ActionRuntime;                     // tier 3
}
```

| Action | Preconditions | Effects | Cost |
|---|---|---|---|
| `MoveToTarget` | `TARGET_KNOWN` | `AT_TARGET` | path length |
| `MoveToMarket` | — | `AT_MARKET` | path length |
| `MoveToSmith` | — | `AT_SMITH` | path length |
| `MoveToInn` | — | `AT_INN` | path length |
| `MoveToGuild` | — | `AT_HOME_GUILD` | path length |
| `Attack` | `AT_TARGET` | `TARGET_DEAD` | `estRounds × dangerRatio × 4` |
| `ClaimBounty` | `AT_TARGET`, `TARGET_DEAD`, `BOUNTY_KNOWN` | `HAS_GOLD` | 1 |
| `LootCorpse` *(rogue)* | `AT_TARGET`, `TARGET_DEAD` | `HAS_GOLD` | 2 |
| `BuyPotion` | `AT_MARKET`, `HAS_GOLD` | `HAS_POTION`, ¬`HAS_GOLD` | 3 |
| `DrinkPotion` | `HAS_POTION` | ¬`IS_INJURED`, ¬`HAS_POTION` | 1 |
| `BuyUpgrade` | `AT_SMITH`, `HAS_GOLD`, `UPGRADE_AVAILABLE` | ¬`HAS_GOLD`, ¬`UPGRADE_AVAILABLE` | 3 |
| `RestAtInn` | `AT_INN`, `HAS_GOLD` | `IS_RESTED`, ¬`IS_INJURED`, ¬`HAS_GOLD` | 5 |
| `HealAtGuild` | `AT_HOME_GUILD` | ¬`IS_INJURED` | 25 |
| `Flee` | `THREAT_NEARBY` | `SAFE`, ¬`THREAT_NEARBY` | `8 / (2 − courage)` |
| `ExploreTile` | — | `TARGET_KNOWN` | path length × 1.2 |
| `Idle` | — | `SAFE` | 50 |

`Idle` is deliberately expensive and always satisfiable. It is the guaranteed fallback
that makes "no plan found" a non-event rather than a stall.

`HealAtGuild` is cheap in gold but expensive in cost, so heroes prefer the inn when they
can afford it and trudge home when they can't. That behaviour is emergent from two
numbers, not scripted.

---

## 4. Goals

Scored every ~1 s per agent, staggered. Highest score wins, with a **15% incumbency
bonus** for the currently active goal.

| Goal | Target state | Considerations |
|---|---|---|
| **Survive** | `SAFE` ∧ ¬`IS_CRITICAL` | hp ratio → `INVERSE_STEEP`; threat power ratio → `INVERSE` ⊗ courage |
| **Heal** | ¬`IS_INJURED` | hp ratio → `INVERSE`; gold ÷ 40 → `SATURATING`; distance to inn/guild → `INVERSE` |
| **ClaimBounty** | `HAS_GOLD` via `ClaimBounty` | bounty ÷ (gold + 100) → `SATURATING` ⊗ greed; distance → `INVERSE`; danger ÷ power → `INVERSE` ⊗ courage |
| **HuntMonster** | `TARGET_DEAD` | danger ÷ power → `INVERSE` ⊗ courage; distance → `INVERSE`; class aggression → constant |
| **DefendHome** | `TARGET_DEAD` near own building | building damage fraction → `LINEAR` ⊗ loyalty_eff; distance → `INVERSE_STEEP` |
| **Upgrade** | ¬`UPGRADE_AVAILABLE` | gold ÷ upgrade cost → `SATURATING`; current gear tier → `INVERSE` |
| **Explore** | `TARGET_KNOWN` | frontier distance → `INVERSE` ⊗ curiosity; local threat → `INVERSE` |
| **Idle** | `SAFE` | constant `0.05` — the floor |

⊗ denotes trait-weighted curve variant selection, not multiplication by the trait.

### Event-driven interrupts

`Survive` and `DefendHome` re-evaluate immediately, outside the stagger schedule, when:

- the agent takes damage
- a friendly building within radius 20 takes damage
- `THREAT_NEARBY` flips true

Everything else waits its turn. Without interrupts, a hero can take up to a second to
notice it is dying — visible and bad.

### Class goal availability

| Goal | Warrior | Ranger | Rogue |
|---|---|---|---|
| DefendHome | 1.0× | 0.4× | 0.4× |
| Explore | 0.5× | 1.0× | 0.5× |
| ClaimBounty | 1.0× | 1.0× | 1.0× |
| HuntMonster | 1.0× | 0.8× | 0.6× |

Combined with the traits in `docs/01-game-design.md` §4.2, this reproduces the genre's
documented behaviour: rogues reach bounties first, warriors defend, rangers wander off
and find things.

---

## 5. Scoring

```ts
export function scoreGoal(g: GoalDef, a: Agent, w: World): ScoreBreakdown {
  const parts: number[] = [];
  let product = 1;

  for (const c of g.considerations) {
    const raw = c.input(a, w);                       // already normalised 0..1
    const v = c.trait
      ? traitCurve(c.family, a.traits[c.trait], raw)
      : curve(c.family.NEUTRAL, raw);
    parts.push(v);
    product = product * v;
  }

  // compensation: adding considerations must not systematically depress scores
  const n = g.considerations.length;
  const mod = 1 - 1 / n;
  let score = product + (1 - product) * mod * product;

  score = score * g.classMultiplier[a.classId];
  if (a.currentGoal === g.id) score = score * 1.15;   // incumbency

  return { goalId: g.id, score, parts };
}
```

Only `+ - *` — no exponents. `ScoreBreakdown.parts` is what the Hero Inspector displays,
so it must be retained, not recomputed.

**Tuning rule: at most 5 considerations per goal.** Beyond that the interactions stop
being predictable and the whole thing becomes an unbalanceable soup.

---

## 6. Planner

Backward A* from the goal state toward the current state. Backward chaining prunes far
harder than forward search, because most actions are irrelevant to any given goal.

```
plan(agent, goalState):
  open  ← { node(goalState, g=0) }
  seen  ← {}
  expansions ← 0

  while open not empty:
    if ++expansions > 150: return null           // budget exceeded
    node ← pop lowest f = g + h

    if satisfies(agent.currentState, node.state):
      return reconstructForward(node)

    for action in actionsAffecting(node.unsatisfiedMask):
      if agent.classId not in action.classes: continue
      if not action.isValid(agent, world): continue
      child ← regress(node.state, action)
      if seen has child.hash with lower g: continue
      child.g ← node.g + action.cost(agent, world)
      child.h ← popcount(child.unsatisfiedMask)     // admissible
      push child

  return null
```

**On `null`:** drop to the next-highest-scoring goal and plan again. `Idle` is always
satisfiable, so the stack can never be empty. A `null` is normal operation, not an error
— but log the rate in dev, because a rising rate means content is broken.

### Regression

```ts
function regress(s: State, a: ActionDef): State {
  // remove what the action provides, add what it requires
  const values = (s.values & ~a.eff.mask) | a.pre.values;
  const mask   = (s.mask   & ~a.eff.mask) | a.pre.mask;
  return { values, mask };
}
```

### Cache

LRU keyed on `(goalId, stateHash, classId)`, capacity 512. Hit rate should exceed 80% —
dozens of heroes share situations constantly. **Expose hits/misses for the dev overlay;**
a collapsing hit rate is the first sign of a performance problem.

### Replan triggers

Never on a timer alone.

1. Current action returned `failure`
2. A symbol in the plan's accumulated precondition mask flipped
3. Goal selection elected a different goal
4. Hard ceiling: 5 s since last plan, staggered by `agentId % 10`

---

## 7. Execution

```ts
type StepResult = 'running' | 'success' | 'failure';

interface ActionRuntime {
  start(a: Agent, w: World): void;
  tick(a: Agent, w: World): StepResult;
  stillValid(a: Agent, w: World): boolean;
  abort(a: Agent, w: World): void;
}
```

Each tick: `stillValid()` first, then `tick()`. Invalid or failed → abort, replan. A
failed action is ordinary, not exceptional — the target moved, the shop is gone, the
path is blocked. Never throw.

---

## 8. Henchmen — explicitly not this system

Peasants, tax collectors and guards use plain finite state machines. They have no
self-interest and no choices worth searching over; planning would spend CPU producing
behaviour a 30-line FSM produces identically.

```
Peasant:       Idle → WalkToSite → Build → (Repair) → Idle
TaxCollector:  Idle → WalkToGuild → Collect → WalkToPalace → Deposit → Idle
Guard:         Patrol → Engage → ReturnToPost → Patrol
```

Guards never leave radius 8 of their post, even while chasing. Tax collectors drop
carried gold on the ground on death, where any hero — rogues first, given greed — will
pick it up.

---

## 9. Monsters

Same three-tier stack, different weights. No greed, no shopping, no upgrade goal.

| Goal | Weight | Notes |
|---|---|---|
| `AttackStructure` | 1.0 | Ratkin: nearest structure |
| `AttackHenchman` | 1.2 | **Goblins only** — targets the economy, not the army |
| `Survive` | 0.3 | Monsters are brave to the point of stupidity, deliberately |
| `Idle` | 0.05 | Floor |

Reusing the hero stack is a large architectural saving and produces better monster
behaviour than a bespoke system would.

---

## 10. Hero Inspector

**Build this at milestone 3, not later.** It is the debugger for this entire document,
the balancing instrument, and a shipped player feature. One build, three uses.

Displays live, for the selected hero:

- Name, class, level, XP bar, gold, HP
- Traits as labelled bars
- **Current goal plus the top 3 rivals with scores**
- **Per-consideration breakdown of the winning goal** — the `parts` array from §5
- Current plan as an ordered step list, active step highlighted
- Ring buffer of the last 10 goal switches with the trigger that caused each

All of this already exists in agent state. The panel is a read-only view — it must not
recompute anything, or it will disagree with the simulation.

---

## 11. Tuning order

When heroes behave wrongly, adjust in this order. Going out of order produces
whack-a-mole.

1. **Consideration inputs** — is the raw value actually measuring what you think?
2. **Curve family** — is the response shape right (steep vs saturating)?
3. **Trait values** — is this class supposed to feel like this?
4. **Class multipliers** — is the goal even appropriate for this class?
5. **Action costs** — only if the *plan* is wrong, not the goal
6. **New actions or goals** — last resort; adding vocabulary before tuning the existing
   set is how the system becomes unbalanceable

---

## 12. Acceptance criteria for milestone 2

The AI is working when, in a headless 5,000-tick run with 20 heroes:

- No hero is idle for more than 60 consecutive seconds
- **Rogues claim bounties before warriors** at a statistically visible margin
- Warriors are the majority of responders to building damage
- Rangers reveal more fog than the other classes combined
- Heroes below 25% HP retreat rather than continue fighting, in >90% of cases
- Planner cache hit rate exceeds 80%
- No `null` plan rate above 5% of planning attempts

Meet these before building anything downstream. Every later milestone assumes the AI
reads as intelligent.
