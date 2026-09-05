# 06 — Testing

The core is pure and deterministic, which makes a class of tests possible that most
games can't write. Use them; they are the main reason for the architecture.

---

## 1. Tiers

| Tier | File | Runs | Purpose |
|---|---|---|---|
| **Determinism** | `replay.spec.ts` | every commit, 4 engines | The canary. Catches everything. |
| **Property** | `planner.spec.ts` | every commit | Planner correctness under random input |
| **Soak** | `soak.spec.ts` | every commit | Long-run behavioural invariants |
| **Balance** | `economy.spec.ts` | nightly | Configuration sweeps |
| **Performance** | `perf.spec.ts` | every commit | Regression guard on tick cost |
| **Unit** | co-located | every commit | Individual pure functions |

Full suite under 30 seconds. If it creeps past that, move `economy.spec.ts` to nightly
first — it's the only one that should ever be slow.

---

## 2. Determinism — the canary

```ts
test('identical seeds produce identical worlds', () => {
  const a = new World(GOLDEN_SEED);
  const b = new World(GOLDEN_SEED);
  for (let i = 0; i < 10_000; i++) { a.tick(); b.tick(); }
  expect(hashWorld(a)).toBe(hashWorld(b));
});

test('golden replay matches recorded hash', () => {
  const w = new World(GOLDEN_SEED);
  replay(w, GOLDEN_COMMAND_LOG, 10_000);
  expect(hashWorld(w)).toBe(GOLDEN_HASH);   // checked-in constant
});
```

This catches far more than determinism bugs. Any unintended behavioural change anywhere
in the simulation breaks the golden hash, which makes it a free regression test for the
entire core.

**When the golden hash changes intentionally** — you changed balance, added a system —
update the constant *in the same commit as the change*, and say so in the message. A
golden-hash update in a commit that claims to be a refactor is a red flag in review.

### Cross-engine

`replay.spec.ts` runs on Node plus **Chromium, Firefox and WebKit** via Playwright. All
four must agree.

Wire this up at **milestone 1**, not later. If determinism discipline slips, you want to
learn that within a week, not during a playtest three months in.

---

## 3. Planner property tests

The planner's contract: *any plan it returns must actually reach the goal.*

```ts
test('every returned plan reaches its goal', () => {
  const rng = new Rng(1234);
  for (let i = 0; i < 1000; i++) {
    const start = randomState(rng);
    const goal  = randomState(rng);
    const plan  = planner.plan(agentWith(start), goal);
    if (!plan) continue;                       // null is legal

    let s = start;
    for (const action of plan) {
      expect(satisfies(s, action.pre)).toBe(true);   // precondition held
      s = apply(s, action.eff);
    }
    expect(satisfies(s, goal)).toBe(true);
  }
});
```

This catches precondition/effect mistakes in **content**, which is where they actually
happen. Every new action added to `src/content/` is covered automatically.

Also assert: node expansions never exceed the 150 budget, and the returned plan's cost
matches the sum of its actions' costs.

---

## 4. Soak invariants

Long runs asserting *properties*, not exact values. Exact values are the golden hash's
job.

```ts
test('20 heroes, 5000 ticks, no pathology', () => {
  const w = scenario('standard', SEED);
  run(w, 5000);

  expect(w.stats.maxIdleStreakSeconds).toBeLessThan(60);
  expect(w.treasury).toBeGreaterThan(0);
  expect(w.treasury).toBeLessThan(50_000);
  expect(w.stats.plannerCacheHitRate).toBeGreaterThan(0.8);
  expect(w.stats.nullPlanRate).toBeLessThan(0.05);
  expect(w.entities.length).toBeLessThan(400);          // no leak
  expect(w.stats.heroesReachedLevel3).toBeGreaterThan(0);
});
```

### Behavioural invariants — milestone 2 acceptance

These encode the design, and they are the tests that tell you the game works:

```ts
test('rogues claim bounties before warriors', () => {
  const w = scenario('bounty-race', SEED);
  run(w, 3000);
  expect(w.stats.firstClaimByClass.rogue)
    .toBeGreaterThan(w.stats.firstClaimByClass.warrior * 1.5);
});

test('warriors dominate defence responses', () => { … });
test('rangers reveal more fog than other classes combined', () => { … });
test('heroes below 25% hp retreat in >90% of cases', () => { … });
```

Run each across **at least 5 seeds** and assert on the aggregate. A single seed proves
nothing about a stochastic system.

---

## 5. Balance sweeps

```ts
test.each(gridOf({
  taxRate:    [0, 0.1, 0.2, 0.3, 0.5],
  bountySize: [100, 300, 600],
  guildMix:   ['warrior-heavy', 'balanced', 'rogue-heavy'],
}))('config %o stays viable', (cfg) => {
  const w = scenario(cfg, SEED);
  run(w, 20_000);
  expect(w.outcome).not.toBe('lost-before-tick-3000');
  expect(w.treasury).toBeGreaterThan(0);
  expect(w.stats.meanHeroLifetimeSeconds).toBeGreaterThan(180);
  expect(w.stats.meanHeroLifetimeSeconds).toBeLessThan(900);
});
```

45 configurations × 20,000 ticks, headless, in seconds. **Balance by simulation, verify
by playing** — not the reverse. A failing configuration is a balance bug with a
reproducible seed attached, which is a vastly better starting point than "it felt wrong".

---

## 6. Performance regression

```ts
test('tick cost stays within budget at 80 agents', () => {
  const w = scenario('full-kingdom', SEED);
  run(w, 500);                                  // warm up
  const t0 = performance.now();
  run(w, 1000);
  const msPerTick = (performance.now() - t0) / 1000;
  expect(msPerTick).toBeLessThan(8);            // 5ms target, 8ms CI headroom
});
```

CI machines are slower and noisier than your laptop, hence the headroom. Track the
number over time; a steady climb matters more than any single run.

---

## 7. What not to do

| Anti-pattern | Why |
|---|---|
| Widening a tolerance on the determinism hash | The floats are exact. A mismatch is a real bug. |
| `.skip` on a failing determinism test | You have just disabled the regression net for the whole core |
| Asserting exact values in soak tests | Brittle; that's the golden hash's job. Assert properties. |
| Single-seed behavioural tests | Proves nothing about a stochastic system |
| Mocking the world in AI tests | The world is cheap and headless. Use a real one. |
| Testing through the renderer | The core is testable directly. Never require a canvas. |
| Updating the golden hash without saying why | Hides behavioural changes in unrelated commits |

---

## 8. Scenarios

`tests/scenarios.ts` provides named, reproducible setups so tests stay readable:

| Scenario | Contents |
|---|---|
| `minimal` | One hero, one ratkin, empty map |
| `standard` | Palace, 3 guilds, 2 shops, 20 heroes, 2 lairs |
| `bounty-race` | Equal warriors and rogues, one high-value flag equidistant |
| `siege` | Palace under sustained attack, no lairs reachable |
| `full-kingdom` | 80 agents, all buildings, 3 lairs — the performance case |
| `economy-only` | No monsters; pure gold circulation |

Each takes a seed and returns a fully constructed `World`. Never build a world inline in
a test — scenarios keep the tests about behaviour rather than setup.
