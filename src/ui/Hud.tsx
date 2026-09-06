import { useEffect, useState, type ChangeEvent } from 'react';
import type { Command, Snapshot } from '../core/types';
import { formatGold, formatPercent, formatTick } from './format';
import './ui.css';

export interface HudProps {
  readonly snapshot: Snapshot;
  /** Commands are queued by the app; the HUD never touches World directly. */
  readonly onCommand: (command: Command) => void;
}

export function Hud({ snapshot, onCommand }: HudProps): JSX.Element {
  const [taxPercent, setTaxPercent] = useState(Math.round(snapshot.taxRate * 100));
  useEffect(() => setTaxPercent(Math.round(snapshot.taxRate * 100)), [snapshot.taxRate]);

  const setTaxRate = (event: ChangeEvent<HTMLInputElement>): void => {
    const percent = Number(event.target.value);
    // Keep the decree visible while paused; the deterministic world applies the
    // queued command on the first resumed tick.
    setTaxPercent(percent);
    onCommand({ t: 'SET_TAX_RATE', rate: percent / 100 });
  };

  return (
    <header className="rs-hud" aria-label="Kingdom status">
      <section className="rs-hud__treasury" aria-live="polite" aria-atomic="true">
        <span className="rs-eyebrow">Treasury</span>
        <strong>{formatGold(snapshot.treasury)}</strong>
        {snapshot.escrow > 0 ? <span className="rs-subtle">{formatGold(snapshot.escrow)} in bounties</span> : null}
      </section>

      <label className="rs-tax-control">
        <span className="rs-eyebrow">Tax rate</span>
        <span className="rs-tax-control__value">{formatPercent(taxPercent / 100)}</span>
        <input
          aria-label="Tax rate"
          max="50"
          min="0"
          onChange={setTaxRate}
          step="1"
          type="range"
          value={taxPercent}
        />
        <span className="rs-subtle">Higher tax lowers loyalty.</span>
      </label>

      <dl className="rs-hud__stats">
        <div><dt>Heroes</dt><dd>{snapshot.population.heroes}</dd></div>
        <div><dt>Henchmen</dt><dd>{snapshot.population.henchmen}</dd></div>
        <div><dt>Threats</dt><dd>{snapshot.population.monsters}</dd></div>
        <div><dt>Wave</dt><dd>{snapshot.wave}</dd></div>
        <div><dt>Time</dt><dd>{formatTick(snapshot.tick)}</dd></div>
      </dl>
    </header>
  );
}
