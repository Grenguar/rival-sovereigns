import type { BuildingKind, FlagKind } from '../core/types';
import './ui.css';

export type InteractionMode = 'inspect' | 'build' | 'attack' | 'explore';

export interface ActionBarProps {
  readonly mode: InteractionMode;
  readonly buildKind: BuildingKind | null;
  readonly onModeChange: (mode: InteractionMode) => void;
  readonly onBuildKindChange: (kind: BuildingKind | null) => void;
  readonly onPause: () => void;
}

export function flagKindForMode(mode: InteractionMode): FlagKind | null {
  return mode === 'attack' || mode === 'explore' ? mode : null;
}

export function ActionBar({
  mode,
  buildKind,
  onModeChange,
  onBuildKindChange,
  onPause,
}: ActionBarProps): JSX.Element {
  return (
    <nav aria-label="Kingdom actions" className="rs-action-bar">
      <button
        aria-pressed={mode === 'build'}
        className="rs-button"
        onClick={() => onModeChange('build')}
        type="button"
      >
        Build
      </button>
      <button
        aria-pressed={mode === 'attack'}
        className="rs-button rs-button--quiet"
        onClick={() => onModeChange('attack')}
        type="button"
      >
        Attack bounty
      </button>
      <button
        aria-pressed={mode === 'explore'}
        className="rs-button rs-button--quiet"
        onClick={() => onModeChange('explore')}
        type="button"
      >
        Explore bounty
      </button>
      <button
        aria-label="Pause game"
        className="rs-button rs-button--quiet"
        onClick={onPause}
        type="button"
      >
        Pause
      </button>
      {mode === 'build' && buildKind === null ? (
        <span className="rs-action-bar__hint">Choose a building, then click a tile.</span>
      ) : null}
      <button
        className="rs-action-bar__cancel"
        onClick={() => {
          onModeChange('inspect');
          onBuildKindChange(null);
        }}
        type="button"
      >
        Inspect
      </button>
    </nav>
  );
}
