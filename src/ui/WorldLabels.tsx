import type { EntityId, Snapshot } from '../core/types';
import './ui.css';

export interface WorldLabelsProps {
  readonly snapshot: Snapshot;
  readonly selectedId: EntityId | null;
  readonly projectEntity: (id: EntityId) => { x: number; y: number } | null;
  readonly zoom: number;
}

/**
 * Below this zoom, names are dropped and only bars remain.
 *
 * A name is 200px of screen whatever the zoom, so zooming out to see the shape of
 * the kingdom used to bury it under overlapping text. Semantic zoom is the standard
 * answer: the further out you go, the less each label claims to say.
 */
const NAME_ZOOM_THRESHOLD = 0.85;

/** Margin outside the viewport within which a label is still worth mounting. */
const CULL_MARGIN = 96;

/** DOM labels and bars remain crisp at every zoom level and never enter the sim. */
export function WorldLabels({
  snapshot,
  selectedId,
  projectEntity,
  zoom,
}: WorldLabelsProps): JSX.Element {
  const showNames = zoom >= NAME_ZOOM_THRESHOLD;
  return (
    <div aria-hidden="true" className="rs-world-labels">
      {snapshot.entities.map((entity) => {
        if (!entity.alive || entity.health === undefined) return null;
        const point = projectEntity(entity.id);
        if (point === null) return null;

        // The renderer culls sprites to the camera; labels were not culled, so
        // entities just off screen showed a floating health bar with nothing
        // under it.
        if (
          point.x < -CULL_MARGIN ||
          point.y < -CULL_MARGIN ||
          point.x > window.innerWidth + CULL_MARGIN ||
          point.y > window.innerHeight + CULL_MARGIN
        ) {
          return null;
        }

        const health = Math.max(
          0,
          Math.min(100, (entity.health.hp / entity.health.maxHp) * 100),
        );
        const selected = selectedId === entity.id;
        // A bar over every building at full health is noise. Show damage, and
        // whatever the player has actually selected.
        const showHealth = selected || health < 100;
        const heroName = showNames && entity.kind === 'hero' ? entity.agent?.name : null;
        if (!showHealth && heroName == null) return null;
        return (
          <div
            className={`rs-world-label ${selected ? 'rs-world-label--selected' : ''}`}
            key={entity.id}
            style={{ left: point.x, top: point.y }}
          >
            {selected ? <span className="rs-selection-ring" /> : null}
            {heroName !== undefined && heroName !== null ? (
              <span className={`rs-hero-name rs-hero-name--${entity.agent?.classId}`}>
                {heroName}
              </span>
            ) : null}
            {showHealth ? (
              <span className="rs-health-bar">
                <span style={{ width: `${health}%` }} />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
