import { useEffect, useState } from 'react';
import { BUILDINGS } from '../content/buildings';
import type { Command, Entity, EntityId, Handle, Snapshot } from '../core/types';
import { formatGold } from './format';
import './ui.css';

export interface CouncilPanelProps {
  readonly selectedId: EntityId | null;
  readonly snapshot: Snapshot;
  readonly onCenter: (entity: Entity) => void;
  readonly onBuildNearby: (entity: Entity) => void;
  readonly onAttackTarget: (target: Handle) => void;
  readonly onCommand: (command: Command) => void;
  readonly onDismiss: () => void;
}

function titleFor(entity: Entity): string {
  if (entity.building !== undefined) {
    return BUILDINGS[entity.building.kind]?.label ?? entity.building.kind;
  }
  if (entity.lair !== undefined) {
    return entity.lair.kind === 'ratkinWarren' ? 'Ratkin Warren' : 'Goblin Camp';
  }
  if (entity.flag !== undefined) {
    return entity.flag.kind === 'attack' ? 'Attack Bounty' : 'Explore Bounty';
  }
  if (entity.fsm !== undefined) {
    const words = entity.fsm.kind.replace(/([A-Z])/g, ' $1');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return `Entity ${String(entity.id)}`;
}

function stateFor(entity: Entity): string {
  if (entity.building !== undefined) {
    if (entity.building.state === 'underConstruction') {
      return `${String(Math.round(entity.building.progress * 100))}% constructed`;
    }
    return `${entity.building.state} · level ${String(entity.building.level)}`;
  }
  if (entity.lair !== undefined) return `Hostile structure · wave ${String(entity.lair.wave)}`;
  if (entity.flag !== undefined) return `${String(entity.flag.claimants.length)}/3 heroes responding`;
  return entity.faction === 'crown' ? 'In royal service' : 'Hostile';
}

/**
 * Compact contextual dossier for selected world objects.
 *
 * Heroes keep their deeper AI inspector; this panel owns structures, civic units,
 * lairs, and bounty flags so clicking the world always produces useful actions.
 */
export function CouncilPanel({
  selectedId,
  snapshot,
  onCenter,
  onBuildNearby,
  onAttackTarget,
  onCommand,
  onDismiss,
}: CouncilPanelProps): JSX.Element | null {
  const [confirmDemolition, setConfirmDemolition] = useState(false);
  const entity =
    selectedId === null ? null : (snapshot.entities.find((candidate) => candidate.id === selectedId) ?? null);

  useEffect(() => setConfirmDemolition(false), [selectedId]);

  if (entity === null || entity.agent !== undefined) return null;

  const health = entity.health;
  const healthPercent =
    health === undefined || health.maxHp <= 0 ? null : Math.max(0, (health.hp / health.maxHp) * 100);
  const friendlyBuilding = entity.faction === 'crown' && entity.building !== undefined;
  const hostileStructure = entity.faction !== 'crown' && entity.lair !== undefined;

  return (
    <aside aria-label={`${titleFor(entity)} council dossier`} className="rs-council-panel" data-testid="council-dossier">
      <header className="rs-council-panel__heading">
        <div>
          <span className="rs-eyebrow">Council dossier</span>
          <h2>{titleFor(entity)}</h2>
        </div>
        <button aria-label="Close council dossier" className="rs-icon-button" onClick={onDismiss} type="button">×</button>
      </header>

      <p className="rs-council-panel__state">{stateFor(entity)}</p>
      {health !== undefined && healthPercent !== null ? (
        <div className="rs-dossier-health">
          <span><span>Integrity</span><strong>{health.hp}/{health.maxHp}</strong></span>
          <div aria-label={`${String(Math.round(healthPercent))}% integrity`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(healthPercent)}>
            <span style={{ width: `${String(healthPercent)}%` }} />
          </div>
        </div>
      ) : null}

      {entity.building !== undefined ? (
        <dl className="rs-dossier-stats">
          <div><dt>Vault</dt><dd>{formatGold(entity.building.vault)}</dd></div>
          <div><dt>Footprint</dt><dd>{entity.building.footprint.length} tiles</dd></div>
        </dl>
      ) : null}
      {entity.flag !== undefined ? (
        <dl className="rs-dossier-stats">
          <div><dt>Reward</dt><dd>{formatGold(entity.flag.gold)}</dd></div>
          <div><dt>Status</dt><dd>{entity.flag.resolved ? 'Resolved' : 'Open'}</dd></div>
        </dl>
      ) : null}

      <div className="rs-council-panel__actions">
        <button className="rs-dossier-action" onClick={() => onCenter(entity)} type="button">Center view</button>
        {friendlyBuilding ? (
          <button className="rs-dossier-action" onClick={() => onBuildNearby(entity)} type="button">Build nearby</button>
        ) : null}
        {hostileStructure ? (
          <button className="rs-dossier-action rs-dossier-action--accent" onClick={() => onAttackTarget(entity.handle)} type="button">Post attack bounty</button>
        ) : null}
        {entity.flag !== undefined ? (
          <button className="rs-dossier-action rs-dossier-action--danger" onClick={() => onCommand({ t: 'CANCEL_FLAG', id: entity.id })} type="button">Cancel and refund</button>
        ) : null}
        {friendlyBuilding && entity.building?.kind !== 'palace' ? (
          <button
            aria-pressed={confirmDemolition}
            className="rs-dossier-action rs-dossier-action--danger"
            onClick={() => {
              if (confirmDemolition) onCommand({ t: 'DEMOLISH', id: entity.id });
              else setConfirmDemolition(true);
            }}
            type="button"
          >
            {confirmDemolition ? 'Confirm demolition' : 'Demolish'}
          </button>
        ) : null}
      </div>
      {confirmDemolition ? <p aria-live="polite" className="rs-dossier-warning">This cannot be undone. Press again to confirm.</p> : null}
    </aside>
  );
}
