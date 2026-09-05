import { useState } from 'react';
import type { Command, EntityId, FlagKind, Handle, Snapshot, TileCoord } from '../core/types';
import { formatGold } from './format';
import './ui.css';

export interface FlagToolProps {
  readonly snapshot: Snapshot;
  readonly kind: FlagKind;
  readonly target: Handle | TileCoord | null;
  readonly activeFlagId: EntityId | null;
  readonly onCommand: (command: Command) => void;
}

export function FlagTool({ snapshot, kind, target, activeFlagId, onCommand }: FlagToolProps): JSX.Element | null {
  const [gold, setGold] = useState(200);
  if (target === null && activeFlagId === null) return null;
  const affordable = gold <= snapshot.treasury;
  return (
    <section aria-label="Bounty flag" className="rs-flag-tool">
      <span className="rs-eyebrow">{kind === 'attack' ? 'Attack bounty' : 'Explore bounty'}</span>
      {activeFlagId === null ? <>
        <label>Reward <output>{formatGold(gold)}</output>
          <input aria-label="Bounty reward" max="1000" min="50" onChange={(event) => setGold(Number(event.target.value))} step="50" type="range" value={gold} />
        </label>
        <p className="rs-subtle">Gold moves to escrow now. At most three heroes can claim it.</p>
        {!affordable ? <p className="rs-build-menu__issue" role="status">Treasury needs {formatGold(gold - snapshot.treasury)} more.</p> : null}
        <button className="rs-button" disabled={!affordable || target === null} onClick={() => {
          if (target !== null) onCommand({ t: 'PLACE_FLAG', kind, target, gold });
        }} type="button">Post {formatGold(gold)} bounty</button>
      </> : <button className="rs-button rs-button--danger" onClick={() => onCommand({ t: 'CANCEL_FLAG', id: activeFlagId })} type="button">Cancel bounty and refund gold</button>}
    </section>
  );
}
