import { describe, expect, test } from 'vitest';
import { World } from '../world';
import { movementSystem, stepEntity, facingFromDelta, straightLinePathfinder, DIR8 } from './movement';
import { combatSystem, damageAfterArmour, effectiveArmour, effectiveDamage } from './combat';
import { makeHero, makeMonster } from '../../../tests/fixtures';
import { MONSTERS } from '../../content/monsters';

describe('facingFromDelta', () => {
  test('maps each of the eight directions to its DIR8 index', () => {
    for (let i = 0; i < DIR8.length; i++) {
      const d = DIR8[i]!;
      expect(facingFromDelta(d.x, d.y)).toBe(i);
    }
  });

  test('is scale invariant', () => {
    expect(facingFromDelta(10, 0)).toBe(facingFromDelta(0.1, 0));
    expect(facingFromDelta(5, 5)).toBe(facingFromDelta(0.2, 0.2));
  });

  test('a zero delta does not throw', () => {
    expect(facingFromDelta(0, 0)).toBe(0);
  });
});

describe('movement', () => {
  test('an entity walks to its destination and stops there', () => {
    const w = new World(1);
    const { entity } = makeHero(w, 'warrior', 0, 0);
    entity.movement!.destination = { tx: 5, ty: 0 };

    for (let i = 0; i < 200 && entity.movement!.destination !== null; i++) {
      movementSystem(w);
    }

    expect(entity.transform.x).toBeCloseTo(5, 6);
    expect(entity.transform.y).toBeCloseTo(0, 6);
    expect(entity.movement!.destination).toBeNull();
  });

  test('speed governs arrival time — a rogue beats a warrior over the same ground', () => {
    const w = new World(1);
    const warrior = makeHero(w, 'warrior', 0, 0);
    const rogue = makeHero(w, 'rogue', 0, 0);
    warrior.entity.movement!.destination = { tx: 20, ty: 0 };
    rogue.entity.movement!.destination = { tx: 20, ty: 0 };

    let warriorTicks = 0;
    let rogueTicks = 0;
    for (let i = 1; i <= 500; i++) {
      movementSystem(w);
      if (warriorTicks === 0 && warrior.entity.movement!.destination === null) warriorTicks = i;
      if (rogueTicks === 0 && rogue.entity.movement!.destination === null) rogueTicks = i;
    }
    expect(rogueTicks).toBeGreaterThan(0);
    expect(rogueTicks).toBeLessThan(warriorTicks);
  });

  test('two entities meet deterministically', () => {
    // A1's acceptance criterion.
    const run = () => {
      const w = new World(7);
      const a = makeHero(w, 'warrior', 0, 0);
      const b = makeHero(w, 'ranger', 10, 10);
      a.entity.movement!.destination = { tx: 5, ty: 5 };
      b.entity.movement!.destination = { tx: 5, ty: 5 };
      for (let i = 0; i < 300; i++) movementSystem(w);
      return {
        a: [a.entity.transform.x, a.entity.transform.y],
        b: [b.entity.transform.x, b.entity.transform.y],
        hash: w.hash(),
      };
    };
    const first = run();
    const second = run();

    expect(first.a).toEqual([5, 5]);
    expect(first.b).toEqual([5, 5]);
    expect(first).toEqual(second);
  });

  test('an unreachable destination is cleared so the action can fail and replan', () => {
    const w = new World(1);
    const { entity } = makeHero(w);
    entity.movement!.destination = { tx: 9, ty: 9 };
    stepEntity(entity, { find: () => null }, w.topologyVersion);
    expect(entity.movement!.destination).toBeNull();
  });

  test('a topology change forces a lazy repath rather than an eager one', () => {
    const w = new World(1);
    const { entity } = makeHero(w, 'warrior', 0, 0);
    entity.movement!.destination = { tx: 10, ty: 0 };
    movementSystem(w);
    expect(entity.movement!.path.length).toBeGreaterThan(0);

    let calls = 0;
    const counting = { find: (_f: never, t: never) => { calls++; return straightLinePathfinder.find(_f, t); } };
    w.topologyVersion++;
    stepEntity(entity, counting as never, w.topologyVersion);
    expect(calls).toBe(1);
  });
});

describe('combat', () => {
  test('damage taken is at least 1 however heavy the armour', () => {
    const w = new World(1);
    const weak = makeHero(w, 'rogue');
    const tank = makeHero(w, 'warrior');
    tank.entity.equipment!.armourTier = 2; // +5 on top of base 3
    expect(effectiveArmour(tank.entity)).toBe(8);
    expect(damageAfterArmour(weak.entity, tank.entity)).toBe(1);
  });

  test('weapon tier and level both scale damage', () => {
    const w = new World(1);
    const { entity } = makeHero(w, 'warrior');
    const base = effectiveDamage(entity);
    entity.equipment!.weaponTier = 1; // +20%
    expect(effectiveDamage(entity)).toBeCloseTo(base * 1.2, 6);
    entity.progression!.level = 2; // +10%
    expect(effectiveDamage(entity)).toBeCloseTo(base * 1.2 * 1.1, 6);
  });

  test('a hero kills a ratkin in under 200 ticks, identically every run', () => {
    // A2's acceptance criterion.
    const run = () => {
      const w = new World(11);
      const hero = makeHero(w, 'warrior', 0, 0);
      const ratkin = makeMonster(w, 'ratkin', 0, 0);
      hero.entity.combat!.target = ratkin.entity.handle;

      let killedAt = -1;
      for (let t = 0; t < 200; t++) {
        combatSystem(w);
        if (!ratkin.entity.alive && killedAt < 0) killedAt = t;
        w.step();
      }
      return { killedAt, hash: w.hash() };
    };

    const first = run();
    const second = run();
    expect(first.killedAt).toBeGreaterThan(0);
    expect(first.killedAt).toBeLessThan(200);
    expect(first).toEqual(second);
  });

  test('attack interval is respected — no swinging every tick', () => {
    const w = new World(1);
    const hero = makeHero(w, 'warrior', 0, 0);
    const ratkin = makeMonster(w, 'ratkin', 0, 0);
    ratkin.entity.combat!.damage = 0; // isolate the hero's output
    hero.entity.combat!.target = ratkin.entity.handle;

    const before = ratkin.entity.health!.hp;
    combatSystem(w); // one swing lands
    const afterFirst = ratkin.entity.health!.hp;
    combatSystem(w); // same tick, interval not elapsed
    expect(ratkin.entity.health!.hp).toBe(afterFirst);
    expect(afterFirst).toBeLessThan(before);
  });

  test('friendly fire is impossible', () => {
    const w = new World(1);
    const a = makeHero(w, 'warrior', 0, 0);
    const b = makeHero(w, 'rogue', 0, 0);
    a.entity.combat!.target = b.entity.handle;
    combatSystem(w);
    expect(b.entity.health!.hp).toBe(b.entity.health!.maxHp);
  });

  test('monster loot goes to whoever made the kill', () => {
    // docs/01-game-design.md §3.1: monster loot flows world -> hero on kill.
    const w = new World(3);
    const hero = makeHero(w, 'warrior', 0, 0);
    const ratkin = makeMonster(w, 'ratkin', 0, 0);
    hero.entity.combat!.target = ratkin.entity.handle;

    for (let t = 0; t < 200 && ratkin.entity.alive; t++) {
      combatSystem(w);
      w.tick++;
    }
    expect(ratkin.entity.alive).toBe(false);
    expect(hero.entity.purse?.gold).toBe(MONSTERS.ratkin!.loot);
  });

  test('a rogue takes a 60% premium on monster loot', () => {
    // §4.3 — most of why the rogue is the class that chases money.
    const kill = (classId: 'warrior' | 'rogue') => {
      const w = new World(3);
      const hero = makeHero(w, classId, 0, 0);
      const ratkin = makeMonster(w, 'ratkin', 0, 0);
      hero.entity.combat!.target = ratkin.entity.handle;
      for (let t = 0; t < 400 && ratkin.entity.alive; t++) {
        combatSystem(w);
        w.tick++;
      }
      return hero.entity.purse!.gold;
    };
    expect(kill('rogue')).toBe(Math.floor(MONSTERS.ratkin!.loot * 1.6));
    expect(kill('rogue')).toBeGreaterThan(kill('warrior'));
  });

  test('a kill awards xp and can level the killer up', () => {
    const w = new World(3);
    const hero = makeHero(w, 'warrior', 0, 0);
    hero.entity.progression!.xp = 95; // level 2 is at 100
    const ratkin = makeMonster(w, 'ratkin', 0, 0);
    hero.entity.combat!.target = ratkin.entity.handle;

    for (let t = 0; t < 200 && ratkin.entity.alive; t++) {
      combatSystem(w);
      w.tick++;
    }
    expect(hero.entity.progression!.xp).toBe(95 + MONSTERS.ratkin!.xp);
    expect(hero.entity.progression!.level).toBe(2);
    expect(hero.entity.health!.maxHp).toBeCloseTo(120 * 1.15, 4);
  });

  test('taking damage schedules an immediate goal re-score', () => {
    const w = new World(1);
    const hero = makeHero(w, 'rogue', 0, 0);
    const monster = makeMonster(w, 'goblin', 0, 0);
    hero.agent.nextGoalTick = 999;
    monster.entity.combat!.target = hero.entity.handle;

    combatSystem(w);
    expect(hero.agent.nextGoalTick).toBe(w.tick);
  });
});
