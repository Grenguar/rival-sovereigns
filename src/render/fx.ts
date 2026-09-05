import { Sprite } from 'pixi.js';
import type { Container, Texture } from 'pixi.js';

export type GroundFxKind = 'deathDecal' | 'constructionDust';

interface ActiveFx {
  readonly sprite: Sprite;
  readonly startedAt: number;
  readonly durationMs: number;
}

/** Visual-only ground effects. Their lifecycle never feeds back into the simulation. */
export class GroundFxRenderer {
  private readonly active: ActiveFx[] = [];
  private readonly free: Sprite[] = [];

  spawn(container: Container, texture: Texture, x: number, y: number, kind: GroundFxKind, now: number): void {
    const sprite = this.free.pop() ?? new Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(x, y);
    sprite.alpha = kind === 'deathDecal' ? 0.8 : 0.65;
    sprite.tint = kind === 'deathDecal' ? 0x7a5334 : 0xe8b93c;
    container.addChild(sprite);
    this.active.push({ sprite, startedAt: now, durationMs: kind === 'deathDecal' ? 200 : 350 });
  }

  update(container: Container, now: number): void {
    for (let index = this.active.length - 1; index >= 0; index--) {
      const effect = this.active[index] as ActiveFx;
      const elapsed = now - effect.startedAt;
      if (elapsed < effect.durationMs) {
        effect.sprite.alpha = Math.max(0, 1 - elapsed / effect.durationMs);
        continue;
      }
      container.removeChild(effect.sprite);
      this.free.push(effect.sprite);
      this.active.splice(index, 1);
    }
  }

  clear(container: Container): void {
    for (const effect of this.active) container.removeChild(effect.sprite);
    this.free.push(...this.active.map((effect) => effect.sprite));
    this.active.length = 0;
  }
}
