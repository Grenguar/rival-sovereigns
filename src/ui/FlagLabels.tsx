import type { Snapshot } from '../core/types';
import { formatGold } from './format';
import './ui.css';

export interface FlagLabelsProps {
  readonly snapshot: Snapshot;
  /** Converts a tile into canvas-relative DOM coordinates. */
  readonly projectTile: (tile: { tx: number; ty: number }) => { x: number; y: number } | null;
}

/** DOM labels stay sharp and accessible at every Pixi zoom level. */
export function FlagLabels({ snapshot, projectTile }: FlagLabelsProps): JSX.Element {
  return <div aria-label="Posted bounties" className="rs-flag-labels">
    {snapshot.entities.filter((entity) => entity.alive && entity.flag !== undefined).map((entity) => {
      const flag = entity.flag;
      if (flag === undefined) return null;
      const point = projectTile(flag.tile);
      if (point === null) return null;
      return <span className="rs-flag-label" key={entity.id} style={{ left: point.x, top: point.y }}>{flag.kind} · {formatGold(flag.gold)}</span>;
    })}
  </div>;
}
