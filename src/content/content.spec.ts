import { describe, expect, test } from 'vitest';
import { CLASSES, CLASS_IDS } from './classes';
import { BUILDINGS, PLACEABLE, GUILD_FOR_CLASS } from './buildings';
import { MONSTERS, LAIRS, HENCHMEN } from './monsters';
import { PROGRESSION, WEAPON_TIERS, ARMOUR_TIERS, effectiveLoyalty } from './balance';
import { ClassDefSchema, parseDef, parseTable } from './schema';

describe('content validates at load', () => {
  test('all three classes are present with the documented recruit costs', () => {
    expect(Object.keys(CLASSES).sort()).toEqual(['ranger', 'rogue', 'warrior']);
    expect(CLASSES.warrior?.recruitCost).toBe(180);
    expect(CLASSES.ranger?.recruitCost).toBe(200);
    expect(CLASSES.rogue?.recruitCost).toBe(150);
  });

  test('every class has all four traits inside the documented range', () => {
    for (const id of CLASS_IDS) {
      const traits = CLASSES[id]?.traits;
      expect(traits).toBeDefined();
      for (const value of Object.values(traits!)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1.8);
      }
    }
  });

  test('each class maps to the guild that spawns it, both ways', () => {
    for (const id of CLASS_IDS) {
      expect(CLASSES[id]?.guild).toBe(GUILD_FOR_CLASS[id]);
      expect(BUILDINGS[GUILD_FOR_CLASS[id]]?.spawns).toBe(id);
    }
  });

  test('all eight buildings are present and only the palace is unplaceable', () => {
    expect(Object.keys(BUILDINGS)).toHaveLength(8);
    expect(PLACEABLE).toHaveLength(7);
    expect(PLACEABLE.some((b) => b.id === 'palace')).toBe(false);
    expect(BUILDINGS.palace?.hp).toBe(1000);
  });

  test("the ranger's lodge is the only palace level 2 building", () => {
    const gated = Object.values(BUILDINGS).filter((b) => b.requiresPalaceLevel > 1);
    expect(gated.map((b) => b.id)).toEqual(['rangersLodge']);
  });

  test('monsters carry the documented targeting bias', () => {
    expect(MONSTERS.ratkin?.targetBias).toBe('structure');
    expect(MONSTERS.goblin?.targetBias).toBe('henchman');
    expect(MONSTERS.goblinRaider?.targetBias).toBe('henchman');
  });

  test('only goblins score AttackHenchman', () => {
    expect(MONSTERS.ratkin?.goalMultipliers.AttackHenchman).toBe(0);
    expect(MONSTERS.goblin?.goalMultipliers.AttackHenchman).toBeGreaterThan(1);
  });

  test('the goblin camp gates raiders behind wave 4', () => {
    const raider = LAIRS.goblinCamp?.spawns.find((s) => s.monster === 'goblinRaider');
    expect(raider?.fromWave).toBe(4);
    expect(LAIRS.ratkinWarren?.spawns).toHaveLength(1);
  });

  test('henchmen caps match the design', () => {
    expect(HENCHMEN.peasant?.cap).toBe(4);
    expect(HENCHMEN.taxCollector?.cap).toBe(2);
    expect(HENCHMEN.guard?.cap).toBe(2);
  });
});

describe('schema rejects bad content', () => {
  test('an out-of-range trait fails with the class named', () => {
    const bad = { ...CLASSES.warrior, traits: { ...CLASSES.warrior!.traits, greed: 9 } };
    expect(() => parseDef(ClassDefSchema, bad, 'class')).toThrow(/warrior/);
    expect(() => parseDef(ClassDefSchema, bad, 'class')).toThrow(/traits.greed/);
  });

  test('a missing field fails rather than defaulting silently', () => {
    const { hp: _hp, ...bad } = CLASSES.warrior!;
    expect(() => parseDef(ClassDefSchema, bad, 'class')).toThrow(/hp/);
  });

  test('a key that disagrees with its id is rejected', () => {
    expect(() => parseTable(ClassDefSchema, { rogue: CLASSES.warrior }, 'class')).toThrow(
      /does not match/,
    );
  });
});

describe('balance tables', () => {
  test('progression covers levels 1-5 with rising requirements', () => {
    expect(PROGRESSION).toHaveLength(5);
    for (let i = 1; i < PROGRESSION.length; i++) {
      expect(PROGRESSION[i]!.xp).toBeGreaterThan(PROGRESSION[i - 1]!.xp);
      expect(PROGRESSION[i]!.hp).toBeGreaterThan(PROGRESSION[i - 1]!.hp);
      expect(PROGRESSION[i]!.damage).toBeGreaterThan(PROGRESSION[i - 1]!.damage);
    }
  });

  test('equipment tiers cost more for more', () => {
    expect(WEAPON_TIERS[1].cost).toBe(150);
    expect(WEAPON_TIERS[2].damageMultiplier).toBeCloseTo(1.45, 5);
    expect(ARMOUR_TIERS[2].armourBonus).toBe(5);
  });

  test('a 50% tax rate cuts loyalty by 60%', () => {
    expect(effectiveLoyalty(1.0, 0)).toBeCloseTo(1.0, 5);
    expect(effectiveLoyalty(1.0, 0.5)).toBeCloseTo(0.4, 5);
    expect(effectiveLoyalty(1.4, 0.5)).toBeCloseTo(0.56, 5);
  });

  test('effective loyalty never goes negative', () => {
    expect(effectiveLoyalty(0.5, 1)).toBe(0);
  });
});
