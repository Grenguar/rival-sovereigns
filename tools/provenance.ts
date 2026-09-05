/**
 * Where the shipped atlas came from.
 *
 * Stage B writes this; build-atlas reads it. It exists so the runtime manifest
 * cannot go on describing the atlas as self-made after third-party art has been
 * packed into it — AGENTS.md §5 makes licensing a hard gate, and a gate that only
 * checks the sources while the shipped artefact lies is not a gate.
 */

export const STAGE_B_PROVENANCE = 'public/atlas/src/.stage-b.json';

export interface StageBProvenance {
  sourceAssetId: string;
  frames: string[];
}
