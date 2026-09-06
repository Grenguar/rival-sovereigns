import { describe, expect, it } from 'vitest';
import { FOG_EXPLORED, FOG_UNSEEN, FOG_VISIBLE } from '../src/core/types';
import { isEntityVisible, type FogView } from '../src/render/fog';

/** (0,0) unseen · (1,0) explored · (2,0) visible. */
const fog: FogView = {
  width: 3,
  height: 1,
  at: (tx) => (tx === 0 ? FOG_UNSEEN : tx === 1 ? FOG_EXPLORED : FOG_VISIBLE),
};

const unit = (faction: string, tx: number): boolean => isEntityVisible(fog, faction, false, tx, 0);
const structure = (faction: string, tx: number): boolean =>
  isEntityVisible(fog, faction, true, tx, 0);

describe('what fog of war hides', () => {
  it('never hides your own', () => {
    for (const tx of [0, 1, 2]) {
      expect(unit('crown', tx), `unit at ${String(tx)}`).toBe(true);
      expect(structure('crown', tx), `structure at ${String(tx)}`).toBe(true);
    }
  });

  it('shows an enemy unit only while somebody is looking at it', () => {
    expect(unit('monsters', 0)).toBe(false);
    // Explored is a memory, and a memory of where a goblin stood is worthless —
    // it moved. This is the line that makes scouting a decision rather than a
    // formality.
    expect(unit('monsters', 1)).toBe(false);
    expect(unit('monsters', 2)).toBe(true);
  });

  it('remembers an enemy structure once seen, because a warren does not move', () => {
    expect(structure('monsters', 0)).toBe(false);
    expect(structure('monsters', 1)).toBe(true);
    expect(structure('monsters', 2)).toBe(true);
  });
});
