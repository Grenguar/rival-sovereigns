import type { EntityId, Snapshot } from '../core/types';
import './ui.css';

export interface EventOverlayProps {
  readonly snapshot: Snapshot;
  readonly projectEntity: (id: EntityId) => { x: number; y: number } | null;
}

/** Damage is DOM text by contract; the renderer supplies only entity projection. */
export function EventOverlay({ snapshot, projectEntity }: EventOverlayProps): JSX.Element {
  return <div aria-hidden="true" className="rs-event-overlay">
    {snapshot.events.filter((event) => event.t === 'DAMAGE').map((event, index) => {
      const point = projectEntity(event.target);
      if (point === null) return null;
      return <span className="rs-damage-number" key={`${snapshot.tick}-${event.target}-${index}`} style={{ left: point.x, top: point.y }}>−{event.amount}</span>;
    })}
  </div>;
}
