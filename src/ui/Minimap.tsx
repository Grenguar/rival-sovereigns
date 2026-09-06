import { useEffect, useRef } from 'react';
import type { MissionMap } from '../content/schema';
import type { Snapshot, TileCoord } from '../core/types';
import type { FogView } from '../render/fog';
import './ui.css';

export interface MinimapProps {
  readonly map: MissionMap;
  readonly snapshot: Snapshot;
  readonly fog: FogView | null;
  readonly viewport: { minTx: number; minTy: number; maxTx: number; maxTy: number } | null;
  readonly onJump: (tile: TileCoord) => void;
  readonly onZoom: (factor: number) => void;
}

/** Pixels per tile. 96 tiles at 2px is a 192px map — big enough to aim at. */
const SCALE = 2;

const TERRAIN_COLOUR: Record<string, string> = {
  grass: '#4c7a44',
  forest: '#24502c',
  water: '#2f6c93',
  rock: '#5d5e66',
  road: '#8a6440',
};

/**
 * The map at a glance: where the kingdom is, what has been explored, and what the
 * camera is looking at. Terrain never changes, so it is baked once and the live
 * layers — fog, units, viewport — are drawn over it each frame.
 */
export function Minimap({ map, snapshot, fog, viewport, onJump, onZoom }: MinimapProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const exploredRef = useRef<HTMLElement | null>(null);
  const keyboardCursor = useRef<TileCoord>({ tx: Math.floor(map.width / 2), ty: Math.floor(map.height / 2) });

  if (terrainRef.current === null && typeof document !== 'undefined') {
    const baked = document.createElement('canvas');
    baked.width = map.width;
    baked.height = map.height;
    const ctx = baked.getContext('2d');
    if (ctx !== null) {
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          ctx.fillStyle = TERRAIN_COLOUR[map.terrain[ty * map.width + tx] ?? 'grass'] ?? '#4c7a44';
          ctx.fillRect(tx, ty, 1, 1);
        }
      }
    }
    terrainRef.current = baked;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const baked = terrainRef.current;
    if (canvas === null || baked === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baked, 0, 0, map.width * SCALE, map.height * SCALE);

    if (fog !== null) {
      let explored = 0;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const state = fog.at(tx, ty);
          if (state !== 0) explored++;
          if (state === 2) continue;
          ctx.fillStyle = state === 0 ? '#0b0d14' : 'rgba(11, 13, 20, 0.55)';
          ctx.fillRect(tx * SCALE, ty * SCALE, SCALE, SCALE);
        }
      }
      if (exploredRef.current !== null) {
        const percent = Math.round((explored / (map.width * map.height)) * 100);
        exploredRef.current.textContent = `${String(percent)}% explored`;
      }
    }

    for (const entity of snapshot.entities) {
      if (!entity.alive) continue;
      const tx = Math.round(entity.transform.x);
      const ty = Math.round(entity.transform.y);
      const crown = entity.faction === 'crown';
      // Enemies obey the same rule as the main view: shown only where somebody is
      // looking. A minimap that leaks positions makes scouting pointless.
      if (!crown && fog !== null && fog.at(tx, ty) !== 2) continue;
      const structure = entity.building !== undefined || entity.lair !== undefined;
      if (!crown && !structure && fog === null) continue;

      ctx.fillStyle = crown ? (structure ? '#f0d68a' : '#8fd0f5') : '#d1483c';
      const size = structure ? SCALE * 2 : SCALE;
      ctx.fillRect(tx * SCALE - size / 2, ty * SCALE - size / 2, size, size);
    }

    if (viewport !== null) {
      ctx.strokeStyle = '#f4f0e5';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        viewport.minTx * SCALE + 0.5,
        viewport.minTy * SCALE + 0.5,
        (viewport.maxTx - viewport.minTx) * SCALE,
        (viewport.maxTy - viewport.minTy) * SCALE,
      );
    }
  });

  const jumpTo = (event: { clientX: number; clientY: number }): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const rect = canvas.getBoundingClientRect();
    const tile = {
      tx: Math.max(0, Math.min(map.width - 1, Math.round(((event.clientX - rect.left) / rect.width) * map.width))),
      ty: Math.max(0, Math.min(map.height - 1, Math.round(((event.clientY - rect.top) / rect.height) * map.height))),
    };
    keyboardCursor.current = tile;
    onJump(tile);
  };

  return (
    <section aria-label="Dominion map" className="rs-minimap">
      <header className="rs-minimap__heading">
        <span className="rs-eyebrow">Dominion map</span>
        <small>Drag to survey</small>
      </header>
      <canvas
        aria-label="Kingdom minimap. Use arrow keys to survey the map."
        className="rs-minimap__canvas"
        height={map.height * SCALE}
        onKeyDown={(event) => {
          const delta: Record<string, readonly [number, number] | undefined> = {
            ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4],
          };
          const step = delta[event.key];
          if (step === undefined) return;
          event.preventDefault();
          const next = {
            tx: Math.max(0, Math.min(map.width - 1, keyboardCursor.current.tx + step[0])),
            ty: Math.max(0, Math.min(map.height - 1, keyboardCursor.current.ty + step[1])),
          };
          keyboardCursor.current = next;
          onJump(next);
        }}
        onPointerDown={jumpTo}
        onPointerMove={(event) => {
          if (event.buttons === 1) jumpTo(event);
        }}
        ref={canvasRef}
        role="img"
        tabIndex={0}
        width={map.width * SCALE}
      />
      {/* Wheel and +/- both zoom, but an undiscoverable shortcut is not a control. */}
      <div className="rs-minimap__zoom">
        <button onClick={() => onZoom(1 / 1.35)} title="Zoom out (mouse wheel, or -)" type="button">
          −
        </button>
        <button onClick={() => onZoom(1.35)} title="Zoom in (mouse wheel, or +)" type="button">
          +
        </button>
      </div>
    </section>
  );
}
