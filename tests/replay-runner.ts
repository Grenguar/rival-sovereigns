import { hashWorld } from '../src/core/hash';
import { replay, World } from '../src/core/world';
import { GOLDEN_COMMAND_LOG, GOLDEN_SEED } from './golden';

export const GOLDEN_REPLAY_TICKS = 10_000;
/** Update only with an intentional simulation change, in that same commit. */
export const GOLDEN_REPLAY_HASH = 517076384;

/** The one replay all four JavaScript engines must agree on. */
export function goldenReplayHash(): number {
  const world = new World(GOLDEN_SEED);
  replay(world, GOLDEN_COMMAND_LOG, GOLDEN_REPLAY_TICKS);
  return hashWorld(world);
}
