import type { Snapshot } from '../core/types';
import './ui.css';

export interface EndScreenProps {
  readonly snapshot: Snapshot;
  readonly paused: boolean;
  readonly onPauseChange: (paused: boolean) => void;
  readonly onRestart: () => void;
}

export function EndScreen({ snapshot, paused, onPauseChange, onRestart }: EndScreenProps): JSX.Element | null {
  const terminal = snapshot.outcome !== 'playing';
  if (!terminal && !paused) return null;
  const title = terminal ? snapshot.outcome === 'won' ? 'The realm endures' : 'The palace has fallen' : 'Paused';
  const message = terminal ? snapshot.outcome === 'won' ? 'The last lair is quiet. Your heroes earned this story.' : 'The crown is broken. Begin again with a different bargain.' : 'Time in the kingdom is stopped.';
  return <div aria-modal="true" className="rs-end-screen" role="dialog">
    <section>
      <span className="rs-eyebrow">{terminal ? 'Mission complete' : 'Game controls'}</span>
      <h1>{title}</h1><p>{message}</p>
      <div className="rs-build-menu__actions">
        {!terminal ? <button className="rs-button rs-button--quiet" onClick={() => onPauseChange(false)} type="button">Resume</button> : null}
        <button autoFocus className="rs-button" onClick={onRestart} type="button">Start a new kingdom</button>
      </div>
    </section>
  </div>;
}
