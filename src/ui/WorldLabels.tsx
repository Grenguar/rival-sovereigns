import type { EntityId, Snapshot } from '../core/types';
import './ui.css';

export interface WorldLabelsProps {
  readonly snapshot: Snapshot;
  readonly selectedId: EntityId | null;
  readonly projectEntity: (id: EntityId) => { x: number; y: number } | null;
}

/** DOM labels and bars remain crisp at every zoom level and never enter the sim. */
export function WorldLabels({
  snapshot,
  selectedId,
  projectEntity,
}: WorldLabelsProps): JSX.Element {
  return (
    <div aria-hidden="true" className="rs-world-labels">
      {snapshot.entities.map((entity) => {
        if (!entity.alive || entity.health === undefined) return null;
        const point = projectEntity(entity.id);
        if (point === null) return null;
        const health = Math.max(
          0,
          Math.min(100, (entity.health.hp / entity.health.maxHp) * 100),
        );
        const heroName = entity.kind === 'hero' ? entity.agent?.name : null;
        return (
          <div
            className={`rs-world-label ${selectedId === entity.id ? 'rs-world-label--selected' : ''}`}
            key={entity.id}
            style={{ left: point.x, top: point.y }}
          >
            {selectedId === entity.id ? <span className="rs-selection-ring" /> : null}
            {heroName !== undefined && heroName !== null ? (
              <span className={`rs-hero-name rs-hero-name--${entity.agent?.classId}`}>
                {heroName}
              </span>
            ) : null}
            <span className="rs-health-bar">
              <span style={{ width: `${health}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
