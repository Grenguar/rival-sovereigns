/**
 * The world. HUMAN-OWNED — see AGENTS.md §3.
 *
 * Owns the entity pool, the generational handles, the command queue and — most
 * importantly — the fixed tick order from docs/02-architecture.md §2.2. Reordering
 * the phases below is a determinism change even if every system in them is
 * individually deterministic.
 *
 * Systems register themselves into `hooks`. World never imports a system directly, so
 * tracks A, B and C can land work without touching this file.
 */

import { Rng } from './rng';
import { hashWorld } from './hash';
import type {
  Command,
  CommandLogEntry,
  Entity,
  EntityId,
  EntityKind,
  FactionId,
  Handle,
  Snapshot,
  Transform,
  WorldEvent,
  WorldView,
} from './types';

export const TICK_MS = 100; // 10 Hz — docs/02-architecture.md §2.1
export const TICKS_PER_SECOND = 10;
/** Economy and construction run at 1 Hz, not 10 — §2.2 phase 9. */
export const ECONOMY_PERIOD = 10;

/** A tick phase. Systems get the concrete World; scoring code gets a WorldView. */
export type SystemFn = (w: World) => void;

/**
 * The fixed tick order. Keys are the phases of docs/02-architecture.md §2.2, in
 * order. Each holds a list of systems run in registration order.
 */
export interface SystemHooks {
  sensors: SystemFn[];
  goalSelection: SystemFn[];
  planning: SystemFn[];
  actions: SystemFn[];
  fsm: SystemFn[];
  movement: SystemFn[];
  combat: SystemFn[];
  economy: SystemFn[]; // 1 Hz
  spawning: SystemFn[];
  flags: SystemFn[];
  cleanup: SystemFn[];
  fog: SystemFn[];
}

const emptyHooks = (): SystemHooks => ({
  sensors: [],
  goalSelection: [],
  planning: [],
  actions: [],
  fsm: [],
  movement: [],
  combat: [],
  economy: [],
  spawning: [],
  flags: [],
  cleanup: [],
  fog: [],
});

export interface EntitySpec {
  kind: EntityKind;
  faction: FactionId;
  x: number;
  y: number;
  facing?: number;
}

interface Slot {
  entity: Entity | null;
  generation: number;
}

export class World implements WorldView {
  readonly seed: number;
  readonly rng: Rng;

  tick = 0;
  treasury = 2000; // docs/01-game-design.md §3.3
  escrow = 0;
  taxRate = 0.2;
  palaceLevel = 1;
  wave = 0;
  outcome: 'playing' | 'won' | 'lost' = 'playing';

  /**
   * Bumped whenever a building is placed or destroyed. Agents holding a path across
   * the affected region repath lazily on their next step.
   */
  topologyVersion = 0;

  readonly hooks: SystemHooks = emptyHooks();

  /** Arbitrary per-system state, so systems need no module-level mutables. */
  readonly systemState = new Map<string, unknown>();

  private slots: Slot[] = [];
  private freeList: number[] = [];
  private nextId = 1;

  /** Live entities in ascending id order — the canonical iteration order. */
  private ordered: Entity[] = [];
  private orderedDirty = false;

  private commandQueue: Command[] = [];
  readonly commandLog: CommandLogEntry[] = [];

  private eventBuffer: WorldEvent[] = [];

  private viewCache = new Map<string, { version: number; items: Entity[] }>();
  private membershipVersion = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Entities
  // ───────────────────────────────────────────────────────────────────────────

  spawn(spec: EntitySpec): Entity {
    let index: number;
    if (this.freeList.length > 0) {
      // Pop from the tail so the free list is a stack; order is deterministic
      // because pushes only happen during the cleanup phase, in id order.
      index = this.freeList.pop() as number;
    } else {
      index = this.slots.length;
      this.slots.push({ entity: null, generation: 0 });
    }

    const slot = this.slots[index] as Slot;
    const transform: Transform = { x: spec.x, y: spec.y, facing: spec.facing ?? 0 };
    const entity: Entity = {
      id: this.nextId++ as EntityId,
      handle: { index, generation: slot.generation },
      kind: spec.kind,
      faction: spec.faction,
      transform,
      alive: true,
    };

    slot.entity = entity;
    this.orderedDirty = true;
    this.membershipVersion++;
    this.emit({ t: 'SPAWN', entity: entity.id, kind: entity.kind });
    return entity;
  }

  /** Marks dead. The slot is not recycled until the cleanup phase. */
  kill(h: Handle, killer: EntityId | null = null): void {
    const e = this.get(h);
    if (e === null || !e.alive) return;
    e.alive = false;
    this.membershipVersion++;
    this.emit({ t: 'DEATH', entity: e.id, killer });
  }

  /** Recycles the slot and invalidates every outstanding handle to it. */
  private despawn(e: Entity): void {
    const slot = this.slots[e.handle.index];
    if (slot === undefined || slot.entity !== e) return;
    slot.entity = null;
    slot.generation = (slot.generation + 1) | 0;
    this.freeList.push(e.handle.index);
    this.orderedDirty = true;
    this.membershipVersion++;
  }

  get(h: Handle): Entity | null {
    const slot = this.slots[h.index];
    if (slot === undefined || slot.entity === null) return null;
    if (slot.generation !== h.generation) return null; // stale handle
    return slot.entity;
  }

  isAlive(h: Handle): boolean {
    const e = this.get(h);
    return e !== null && e.alive;
  }

  byId(id: EntityId): Entity | null {
    for (const e of this.entitiesInIdOrder()) if (e.id === id) return e;
    return null;
  }

  /**
   * The canonical iteration order for anything that can affect simulation outcome.
   * docs/03-determinism.md §4.5 — sort by id where order could otherwise vary.
   */
  entitiesInIdOrder(): Entity[] {
    if (this.orderedDirty) {
      this.ordered = [];
      for (const slot of this.slots) {
        if (slot.entity !== null) this.ordered.push(slot.entity);
      }
      this.ordered.sort((a, b) => a.id - b.id);
      this.orderedDirty = false;
    }
    return this.ordered;
  }

  /**
   * Cached filtered view, rebuilt only on membership change —
   * docs/02-architecture.md §3. Always in id order.
   */
  view(key: string, predicate: (e: Entity) => boolean): Entity[] {
    const cached = this.viewCache.get(key);
    if (cached !== undefined && cached.version === this.membershipVersion) {
      return cached.items;
    }
    const items = this.entitiesInIdOrder().filter(predicate);
    this.viewCache.set(key, { version: this.membershipVersion, items });
    return items;
  }

  get views() {
    return {
      agents: this.view('agents', (e) => e.agent !== undefined && e.alive),
      combatants: this.view('combatants', (e) => e.combat !== undefined && e.alive),
      buildings: this.view('buildings', (e) => e.building !== undefined),
      henchmen: this.view('henchmen', (e) => e.fsm !== undefined && e.alive),
      flags: this.view('flags', (e) => e.flag !== undefined && e.alive),
      lairs: this.view('lairs', (e) => e.lair !== undefined && e.alive),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Commands and events
  // ───────────────────────────────────────────────────────────────────────────

  /** Queued now, drained at the start of the next tick. Never applied inline. */
  issue(command: Command): void {
    this.commandQueue.push(command);
  }

  emit(event: WorldEvent): void {
    this.eventBuffer.push(event);
  }

  /** Handlers registered by systems; world itself interprets no command. */
  readonly commandHandlers: ((c: Command, w: World) => void)[] = [];

  private drainCommands(): void {
    if (this.commandQueue.length === 0) return;
    const batch = this.commandQueue;
    this.commandQueue = [];
    for (const command of batch) {
      this.commandLog.push({ tick: this.tick, command });
      for (const handler of this.commandHandlers) handler(command, this);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // The tick — order is contract. Do not reorder.
  // ───────────────────────────────────────────────────────────────────────────

  step(): void {
    this.eventBuffer = [];

    this.drainCommands(); //  1
    this.run(this.hooks.sensors); //  2
    this.run(this.hooks.goalSelection); //  3
    this.run(this.hooks.planning); //  4
    this.run(this.hooks.actions); //  5
    this.run(this.hooks.fsm); //  6
    this.run(this.hooks.movement); //  7
    this.run(this.hooks.combat); //  8
    if (this.tick % ECONOMY_PERIOD === 0) this.run(this.hooks.economy); //  9
    this.run(this.hooks.spawning); // 10
    this.run(this.hooks.flags); // 11
    this.run(this.hooks.cleanup); // 12
    this.reap();
    this.run(this.hooks.fog); // 13

    this.tick++;
  }

  private run(systems: SystemFn[]): void {
    for (const system of systems) system(this);
  }

  /** Phase 12 tail: recycle slots of entities dead and finished with. */
  private reap(): void {
    for (const e of this.entitiesInIdOrder()) {
      if (!e.alive && e.kind !== 'building' && e.kind !== 'lair') this.despawn(e);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Read-only surface
  // ───────────────────────────────────────────────────────────────────────────

  snapshot(): Snapshot {
    let heroes = 0;
    let henchmen = 0;
    let monsters = 0;
    for (const e of this.entitiesInIdOrder()) {
      if (!e.alive) continue;
      if (e.kind === 'hero') heroes++;
      else if (e.kind === 'henchman') henchmen++;
      else if (e.kind === 'monster') monsters++;
    }
    return {
      tick: this.tick,
      treasury: this.treasury,
      escrow: this.escrow,
      taxRate: this.taxRate,
      palaceLevel: this.palaceLevel,
      population: { heroes, henchmen, monsters },
      wave: this.wave,
      entities: this.entitiesInIdOrder(),
      events: this.eventBuffer,
      outcome: this.outcome,
    };
  }

  hash(): number {
    return hashWorld(this);
  }
}

/** Replays a command log against a world for `ticks` ticks. */
export function replay(w: World, log: readonly CommandLogEntry[], ticks: number): void {
  let i = 0;
  for (let t = 0; t < ticks; t++) {
    while (i < log.length && (log[i] as CommandLogEntry).tick === w.tick) {
      w.issue((log[i] as CommandLogEntry).command);
      i++;
    }
    w.step();
  }
}
