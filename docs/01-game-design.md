# 01 — Game Design

---

## 1. The experience we are building

> You place a 200-gold bounty on a ratkin warren. Nothing happens. Your warriors are busy
> and your rogues think 200 is insulting for that much risk. You raise it to 500. A rogue
> named Skeev Thinpurse peels off immediately, arrives alone, panics, and runs. Two
> warriors who were already nearby finish the job and split the bounty. Skeev gets
> nothing and goes to the inn.

That paragraph is the entire design target. Three properties make it work:

1. **Refusal is meaningful.** If heroes always obeyed, the bounty would be a command.
2. **The reason is legible.** You can click Skeev and read exactly why he fled.
3. **Aggregate response is reliable.** One hero is unpredictable; sixty are a
   distribution you can steer with price.

Unpredictable per agent, responsive in aggregate. Everything below serves that.

---

## 2. Core loop

```
   ┌──── build guilds & shops ────┐
   │                              ▼
   │                      heroes spawn (cost gold)
   │                              │
   │                              ▼
   │              heroes hunt, earn, spend, level
   │                    │                  │
   │            shop revenue          bank at guild
   │                    │                  │
   │                    ▼                  ▼
   └──────────── TREASURY ◄──── tax collector
                        │
                        ▼
                 post bounties ──► redirects hero behaviour
```

**The elegance is that bounty gold partly returns.** A hero paid 300 walks to your
blacksmith and spends 180 of it — straight back to the treasury — then banks 80 at the
guild where your tax collector takes a cut. Bounties are stimulus, not pure cost.

Over-tax and heroes can't afford gear, die more, and stop earning. Under-tax and they
get rich while your treasury starves. That tension is the strategy layer, and it
requires zero combat decisions from the player.

---

## 3. Economy

### 3.1 Gold flows

| Flow | Direction | Rate |
|---|---|---|
| Palace stipend | → treasury | 8 gold / 10 s (prevents hard lock) |
| Building cost | treasury → | one-off, see §5 |
| Recruit cost | treasury → | one-off per hero spawned |
| Bounty escrow | treasury → escrow | on flag placement |
| Bounty payout | escrow → hero | on claim; refunded to treasury on cancel |
| Monster loot | world → hero | on kill |
| Shop purchase | hero → treasury | 100%; the player owns the shops |
| Banking | hero → guild vault | hero banks gold above `100` when idle at guild |
| Taxation | guild vault → tax collector → treasury | `taxRate` % of vault per visit |
| **Tax collector death** | carried gold → **ground** | recoverable; rogues will loot it |

That last row is deliberate. Losing a loaded tax collector to a wandering goblin is a
real event, and watching a rogue pocket your tax revenue is exactly the kind of story
this game should generate.

### 3.2 Tax rate

Player-set, `0–50%`, default `20%`. Two effects:

1. Tax collectors take `taxRate` of each guild vault they visit.
2. **Effective loyalty is scaled**: `loyalty_eff = loyalty × (1 − taxRate × 1.2)`.
   At 50% tax, loyalty is down 60% — heroes stop defending your buildings.

That second effect is what makes the slider a decision rather than a number to max out.

### 3.3 Starting conditions

| | Value |
|---|---|
| Treasury | 2,000 |
| Palace | Level 1, 1,000 HP |
| Tax rate | 20% |
| Peasants | 2 (max 4) |
| Tax collectors | 1 (max 2) |
| Palace L2 threshold | 3,000 cumulative tax revenue |

---

## 4. Hero classes

Three in MVP. Mage is the first post-MVP addition — it needs projectiles, mana, spells
and a Library, a whole vertical that demonstrates nothing these three don't.

### 4.1 Stats at level 1

| Class | HP | Damage | Range | Speed | Armour | Recruit | Guild |
|---|---|---|---|---|---|---|---|
| **Warrior** | 120 | 14 | 1 | 1.0 | 3 | 180 | Warrior's Guild |
| **Ranger** | 70 | 11 | 5 | 1.3 | 1 | 200 | Ranger's Lodge |
| **Rogue** | 80 | 9 | 1 | 1.5 | 1 | 150 | Rogues' Guild |

Damage taken = `max(1, damage − armour)`. Attack interval 1.2 s for melee, 1.6 s for
ranged.

### 4.2 Traits

Class base weights, jittered ±20% per hero at spawn.

| Class | greed | courage | curiosity | loyalty |
|---|---|---|---|---|
| Warrior | 0.8 | 1.5 | 0.7 | 1.4 |
| Ranger | 1.0 | 1.0 | 1.6 | 0.8 |
| Rogue | 1.7 | 0.5 | 1.1 | 0.5 |

Traits are curve-variant selectors on utility considerations, never code branches.
Four numbers produce all the documented genre behaviour: rogues reach bounties first,
warriors defend the realm, rangers wander off and find things.

### 4.3 Class-exclusive behaviour

| Class | Exclusive |
|---|---|
| Warrior | `DefendHome` goal available at full weight; others get it at 0.4× |
| Ranger | `Explore` goal; reveals fog in radius 6 rather than 4 |
| Rogue | `LootCorpse` action (+60% of monster loot value); can loot dropped tax gold |

### 4.4 Names

`[title] [given] [epithet]`, drawn from class-specific pools at spawn.

- Warrior — *Sir Caldwyn Broadedge*, *Dame Hessa Ironvow*
- Ranger — *Aelrindel of the Long Watch*, *Sylvaine Quickstep*
- Rogue — *Skeev Thinpurse*, *Little Marn the Unpaid*

200 names per class, generated offline (see `docs/07-backlog.md`, task C4). Cheap to
build and responsible for most of the player's attachment to individual heroes.

### 4.5 Progression

| Level | XP | HP | Damage |
|---|---|---|---|
| 1 | 0 | ×1.00 | ×1.00 |
| 2 | 100 | ×1.15 | ×1.10 |
| 3 | 250 | ×1.32 | ×1.21 |
| 4 | 500 | ×1.52 | ×1.33 |
| 5 | 900 | ×1.75 | ×1.46 |

Level 5 is the MVP cap. XP comes from kills only; assists split evenly.

### 4.6 Equipment

Purchased by heroes with their own gold, at player-owned shops.

| Item | Shop | Cost | Effect |
|---|---|---|---|
| Healing potion | Marketplace | 40 | Restores 50% max HP; carried, one slot |
| Weapon I / II | Blacksmith | 150 / 400 | +20% / +45% damage |
| Armour I / II | Blacksmith | 180 / 450 | +2 / +5 armour |
| Inn rest | Inn | 25 | Full heal over 20 s, plus `IS_RESTED` |

Two equipment slots total (weapon, armour) plus one potion slot. No inventory UI in MVP.

---

## 5. Buildings

| Building | Cost | HP | Palace lvl | Function |
|---|---|---|---|---|
| **Palace** | — | 1,000 | — | Spawns peasants and tax collectors. Destroyed = defeat. |
| Warrior's Guild | 700 | 400 | 1 | Spawns warriors; slow heal at home |
| Rogues' Guild | 650 | 350 | 1 | Spawns rogues |
| Ranger's Lodge | 800 | 350 | 2 | Spawns rangers |
| Marketplace | 350 | 300 | 1 | Sells potions → treasury |
| Blacksmith | 500 | 350 | 1 | Sells upgrades → treasury |
| Inn | 400 | 300 | 1 | Rest, heal, **knowledge exchange** |
| Guardhouse | 300 | 400 | 1 | Spawns 2 guards on a fixed post |

Guilds spawn one hero every 40 s while below cap. Cap is **3 heroes per guild at Palace
L1, 5 at L2**, and each spawn costs the recruit fee from the treasury. If the treasury
can't pay, the spawn is skipped and retried.

Buildings are constructed over time by peasants and are **destructible while under
construction**. A raid on your half-built lodge is a real loss.

---

## 6. Henchmen

Plain finite state machines, not planning agents. They have no self-interest and no
choices worth searching over.

| Unit | HP | States | Notes |
|---|---|---|---|
| **Peasant** | 40 | `Idle → WalkToSite → Build → Repair → Idle` | Max 4. Builds at 12 HP/s of structure. |
| **Tax collector** | 35 | `Idle → WalkToGuild → Collect → WalkToPalace → Deposit` | Max 2. Drops carried gold on death. |
| **Guard** | 90 | `Patrol → Engage → ReturnToPost` | 2 per guardhouse. Never leaves radius 8 of post. |

All are auto-replaced after a 15 s delay. They are numbered, not named — the contrast
with heroes is intentional and free characterisation.

---

## 7. Monsters

Monsters use the **same AI stack as heroes**, with different goal weights (no greed, no
shopping, high aggression). This is a large architectural saving and produces better
behaviour than a bespoke system.

| Unit | HP | Damage | Speed | Loot | XP |
|---|---|---|---|---|---|
| Ratkin | 45 | 7 | 1.0 | 25 | 20 |
| Goblin | 70 | 11 | 1.1 | 45 | 40 |
| Goblin Raider | 90 | 15 | 1.2 | 70 | 65 |

### Lairs

| Lair | HP | Spawns | Interval | Targeting bias |
|---|---|---|---|---|
| Ratkin Warren | 350 | Ratkin ×2 | 45 s | Nearest structure |
| Goblin Camp | 500 | Goblin ×1; + Raider ×1 from wave 4 | 70 s | Tax collectors and peasants |

**Escalation:** spawn interval shrinks 5% per wave, floored at 60% of base. First spawn
at t=60 s. The pressure curve emerges from that rule rather than from a scripted
timeline.

The goblin bias toward henchmen is the design's sharpest tooth — it attacks your
economy rather than your army, and the player has no direct way to protect them.

---

## 8. Reward flags

Two kinds, matching the original genre entry. Four flag types without an economy is
less interesting than two with one.

| Flag | Target | Payout condition |
|---|---|---|
| **Attack** | An enemy unit or structure | Whoever lands the killing blow |
| **Explore** | A map tile | First hero to make that tile `visible` |

Placement: click, set gold with a slider, confirm. Gold is escrowed immediately and
refunded in full on cancellation. Flags render in-world with their value legible.

**Claim cap:** at most 3 heroes may hold a given flag as their active goal target
simultaneously. Without this, a large bounty pulls the entire kingdom into one corner.

---

## 9. Knowledge and fog

Heroes are **not omniscient**. Each carries a personal set of known lairs and flags, and
can only path to something it knows about.

- Fog has three states per tile: `unseen`, `explored` (remembered, stale), `visible`.
- Heroes reveal radius 4 while moving; rangers reveal radius 6.
- **At the Inn, any two co-located heroes merge their knowledge sets.**

This gives rangers structural value beyond damage, gives the Inn a mechanical reason to
exist, and lets an unexplored corner quietly incubate a lair for ten minutes.

---

## 10. Mission 01

One hand-authored map. Procedural generation makes balance testing noisier at exactly
the moment you're balancing.

- **96 × 96 tiles**, mixed grass and forest, a river crossing the north-east
- Palace slightly south-west of centre with a clear build radius
- **Ratkin Warren A** — 22 tiles NE, behind light forest. The tutorial threat.
- **Ratkin Warren B** — 30 tiles SW, open ground. Punishes ignoring the south.
- **Goblin Camp** — 46 tiles E, past the river. The endgame target.

**Win:** all three lairs destroyed.
**Lose:** Palace HP reaches 0.
No timer. Over-fortifying just makes the mission longer.

The intended arc: survive ratkin pressure with warriors → build economy → discover the
goblin camp via a ranger → accumulate enough treasury to post a bounty large enough to
make the assault worth a hero's while. **The climax is an economic decision, not a
tactical one.**

---

## 11. Balance-tuning method

Do not balance by playing. Balance headlessly, then verify by playing.

`tests/economy.spec.ts` sweeps `taxRate × bountySize × guildMix` across a grid, runs
each configuration for 20,000 ticks, and asserts:

- Treasury never goes permanently negative and never exceeds 50,000 (runaway inflation)
- At least one hero reaches level 3 by tick 12,000
- Mean hero lifetime is between 3 and 15 minutes
- No configuration wins or loses in under 5 minutes

A configuration failing these is a balance bug with a reproducible seed attached.
