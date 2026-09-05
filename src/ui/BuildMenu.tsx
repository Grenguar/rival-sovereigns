import type { BuildingKind, Command, Snapshot, TileCoord } from '../core/types';
import { formatGold } from './format';
import './ui.css';

export interface BuildingOption {
  readonly kind: BuildingKind;
  readonly label: string;
  readonly cost: number;
  readonly requiredPalaceLevel: number;
}

export interface BuildingPlacement {
  readonly tile: TileCoord | null;
  readonly valid: boolean;
  readonly reason: string | null;
}

export interface BuildMenuProps {
  readonly snapshot: Snapshot;
  readonly options: readonly BuildingOption[];
  readonly selected: BuildingKind | null;
  readonly placement: BuildingPlacement;
  readonly onSelect: (kind: BuildingKind | null) => void;
  readonly onCommand: (command: Command) => void;
}

export function placementIssue(snapshot: Snapshot, option: BuildingOption | null, placement: BuildingPlacement): string | null {
  if (option === null) return 'Choose a building first.';
  if (snapshot.palaceLevel < option.requiredPalaceLevel) return `Requires Palace level ${option.requiredPalaceLevel}.`;
  if (snapshot.treasury < option.cost) return `Need ${formatGold(option.cost - snapshot.treasury)} more.`;
  if (placement.tile === null) return 'Choose a clear tile on the map.';
  if (!placement.valid) return placement.reason ?? 'That tile cannot hold this building.';
  return null;
}

export function BuildMenu({ snapshot, options, selected, placement, onSelect, onCommand }: BuildMenuProps): JSX.Element {
  const active = options.find((option) => option.kind === selected) ?? null;
  const issue = placementIssue(snapshot, active, placement);
  return (
    <section aria-label="Build menu" className="rs-build-menu">
      <div><span className="rs-eyebrow">Build</span><strong>Shape the kingdom</strong></div>
      <div className="rs-build-menu__options" role="list">
        {options.map((option) => {
          const locked = snapshot.palaceLevel < option.requiredPalaceLevel;
          const unaffordable = snapshot.treasury < option.cost;
          return <button aria-pressed={selected === option.kind} className="rs-build-option" disabled={locked} key={option.kind} onClick={() => onSelect(option.kind)} type="button">
            <span>{option.label}</span><small>{formatGold(option.cost)}{locked ? ` · Palace ${option.requiredPalaceLevel}` : unaffordable ? ' · short on gold' : ''}</small>
          </button>;
        })}
      </div>
      <p aria-live="polite" className={issue === null ? 'rs-build-menu__ready' : 'rs-build-menu__issue'}>{issue ?? `Place ${active?.label}.`}</p>
      <div className="rs-build-menu__actions">
        <button className="rs-button rs-button--quiet" onClick={() => onSelect(null)} type="button">Cancel</button>
        <button className="rs-button" disabled={issue !== null || active === null || placement.tile === null} onClick={() => {
          if (active !== null && placement.tile !== null) onCommand({ t: 'PLACE_BUILDING', kind: active.kind, tile: placement.tile });
        }} type="button">Build for {active === null ? '—' : formatGold(active.cost)}</button>
      </div>
    </section>
  );
}
