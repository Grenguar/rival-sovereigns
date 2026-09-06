import type { EntityId, Snapshot, WorldEvent } from '../core/types';
import './ui.css';

export interface EventOverlayProps {
  readonly snapshot: Snapshot;
  readonly projectEntity: (id: EntityId) => { x: number; y: number } | null;
}

interface Floater {
  readonly anchor: EntityId;
  readonly text: string;
  readonly variant: 'damage' | 'reward' | 'level';
}

/**
 * The moments worth announcing. Damage alone told the player they were watching
 * a fight but never that they were winning one: a claimed bounty is the whole
 * economic loop paying out, and a level-up is the only visible sign a hero is
 * becoming worth defending.
 */
function floaterFor(event: WorldEvent): Floater | null {
  switch (event.t) {
    case 'DAMAGE':
      return { anchor: event.target, text: `−${String(event.amount)}`, variant: 'damage' };
    case 'FLAG_CLAIMED':
      return { anchor: event.by, text: `+${String(event.gold)}g`, variant: 'reward' };
    case 'LEVEL_UP':
      return { anchor: event.entity, text: `LEVEL ${String(event.level)}`, variant: 'level' };
    default:
      return null;
  }
}

/** Damage is DOM text by contract; the renderer supplies only entity projection. */
export function EventOverlay({ snapshot, projectEntity }: EventOverlayProps): JSX.Element {
  return (
    <div aria-hidden="true" className="rs-event-overlay">
      {snapshot.events.map((event, index) => {
        const floater = floaterFor(event);
        if (floater === null) return null;
        const point = projectEntity(floater.anchor);
        if (point === null) return null;
        return (
          <span
            className={`rs-floater rs-floater--${floater.variant}`}
            key={`${String(snapshot.tick)}-${String(index)}`}
            style={{ left: point.x, top: point.y }}
          >
            {floater.text}
          </span>
        );
      })}
    </div>
  );
}
