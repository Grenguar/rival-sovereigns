import type { EntityId, Snapshot } from '../core/types';
import { entityForHandle, formatGold } from './format';
import './ui.css';

export interface HeroInspectorProps {
  readonly snapshot: Snapshot;
  readonly selectedHeroId: EntityId | null;
  readonly onDismiss: () => void;
}

/**
 * The inspector intentionally exposes the AI's intermediate data instead of
 * translating it into vague prose. A player can audit why a hero acted this way.
 */
export function HeroInspector({ snapshot, selectedHeroId, onDismiss }: HeroInspectorProps): JSX.Element | null {
  const hero = selectedHeroId === null ? null : snapshot.entities.find((entity) => entity.id === selectedHeroId);
  if (hero === undefined || hero === null || hero.kind !== 'hero' || hero.agent === undefined) return null;

  const agent = hero.agent;
  const rivals = agent.blackboard.visibleEnemies
    .map((handle) => entityForHandle(snapshot, handle))
    .filter((entity): entity is NonNullable<typeof entity> => entity !== null);

  return (
    <aside aria-label={`${agent.name} hero inspector`} className="rs-inspector">
      <div className="rs-inspector__heading">
        <div>
          <span className="rs-eyebrow">Hero inspector</span>
          <h2>{agent.name}</h2>
          <p>{agent.classId} · {hero.health?.hp ?? 0}/{hero.health?.maxHp ?? 0} health</p>
        </div>
        <button aria-label="Close hero inspector" className="rs-icon-button" onClick={onDismiss} type="button">×</button>
      </div>

      <section>
        <h3>Current intent</h3>
        <p className="rs-inspector__intent">{agent.currentGoal ?? 'No goal selected'}</p>
        <p className="rs-subtle">Target: {agent.blackboard.currentTarget.index < 0 ? 'None' : `entity ${agent.blackboard.currentTarget.index}`}</p>
      </section>

      <section>
        <h3>Goal scores</h3>
        {agent.goalScores.length === 0 ? <p className="rs-empty">Awaiting a goal evaluation.</p> : (
          <ol className="rs-score-list">
            {[...agent.goalScores].sort((a, b) => b.score - a.score || a.goalId.localeCompare(b.goalId)).map((score) => (
              <li key={score.goalId}>
                <span>{score.goalId}</span><strong>{score.score.toFixed(3)}</strong>
                <small>Parts: {score.parts.map((part) => part.toFixed(3)).join(' · ')}</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3>Plan</h3>
        {agent.plan === null ? <p className="rs-empty">No viable plan.</p> : (
          <ol className="rs-plan-list" start={agent.plan.index + 1}>
            {agent.plan.steps.slice(agent.plan.index).map((step, index) => <li key={`${step.action}-${index}`}>{step.action} <span>{step.cost}</span></li>)}
          </ol>
        )}
      </section>

      <section>
        <h3>Nearby rivals</h3>
        {rivals.length === 0 ? <p className="rs-empty">No threats sensed.</p> : (
          <ul className="rs-compact-list">{rivals.map((rival) => <li key={rival.id}>{rival.kind} #{rival.id}{rival.purse ? ` · ${formatGold(rival.purse.gold)}` : ''}</li>)}</ul>
        )}
      </section>

      <section>
        <h3>Decision history</h3>
        {agent.history.length === 0 ? <p className="rs-empty">No goal switches yet.</p> : (
          <ol className="rs-history-list">{agent.history.map((entry, index) => <li key={`${entry.tick}-${index}`}><span>t{entry.tick}</span> {entry.from ?? 'None'} → <strong>{entry.to}</strong> <small>{entry.trigger}</small></li>)}</ol>
        )}
      </section>
    </aside>
  );
}
