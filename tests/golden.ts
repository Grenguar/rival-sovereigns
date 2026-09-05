import type { CommandLogEntry } from '../src/core/types';

/** The seed every determinism test runs against. Never change it casually. */
export const GOLDEN_SEED = 0x5ea50f;

/**
 * Recorded player input for the golden replay. Empty until milestone 4 gives the
 * player something to do; the mechanism is exercised from milestone 0 regardless.
 */
export const GOLDEN_COMMAND_LOG: readonly CommandLogEntry[] = [
  { tick: 5, command: { t: 'SET_TAX_RATE', rate: 0.35 } },
  { tick: 40, command: { t: 'SET_TAX_RATE', rate: 0.15 } },
];
