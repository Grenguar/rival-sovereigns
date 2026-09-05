import { describe, expect, test } from 'vitest';
import { BUILDINGS } from './index';
import { BUILDING_BEHAVIOURS } from './behaviours';

describe('building design metadata', () => {
  test('makes every MVP building answer both the behaviour and placement questions', () => {
    expect(Object.keys(BUILDING_BEHAVIOURS).sort()).toEqual(Object.keys(BUILDINGS).sort());
    for (const behaviour of Object.values(BUILDING_BEHAVIOURS)) {
      expect(behaviour.categories.length).toBeGreaterThan(0);
      expect(behaviour.changes.length).toBeGreaterThan(20);
      expect(behaviour.placementDecision.length).toBeGreaterThan(20);
      expect(behaviour.traffic.length).toBeGreaterThan(20);
    }
  });

  test('preserves the intentionally mixed role of the Inn', () => {
    expect(BUILDING_BEHAVIOURS.inn.categories).toEqual(['sink', 'modifier']);
  });
});
