import type { Entity, Handle, Snapshot } from '../core/types';

export function formatGold(value: number): string {
  return `${Math.max(0, Math.floor(value)).toLocaleString('en-US')} gold`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function formatTick(tick: number): string {
  const seconds = Math.floor(tick / 10);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function entityForHandle(snapshot: Snapshot, handle: Handle): Entity | null {
  for (const entity of snapshot.entities) {
    if (entity.handle.index === handle.index && entity.handle.generation === handle.generation) return entity;
  }
  return null;
}
