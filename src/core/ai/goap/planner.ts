/**
 * A4 — backward A* planner. docs/04-ai-spec.md §6.
 *
 * Backward chaining from the goal state prunes far harder than forward search,
 * because most of the sixteen actions are irrelevant to any given goal.
 *
 * A null plan is normal operation, not an error: the caller drops to the
 * next-highest-scoring goal and tries again, and `Idle` is always satisfiable, so the
 * stack can never be empty. The null *rate* is worth watching though — a rising one
 * means content is broken — so it is counted in PlannerStats.
 */

import type { ActionDef, ActionId, Agent, PlannerStats, State, WorldView } from '../../types';
import { PLANNER_NODE_BUDGET } from '../../../content/balance';
import { popcount, regress, satisfies, stateHash, unsatisfiedMask } from './state';

export interface PlanResult {
  steps: { action: ActionId; cost: number }[];
  totalCost: number;
  /** Union of every step's precondition mask — a flip here invalidates the plan. */
  accumulatedMask: number;
  expansions: number;
}

interface Node {
  state: State;
  g: number;
  f: number;
  action: ActionDef | null;
  parent: Node | null;
}

/**
 * Binary heap ordered by f, ties broken by insertion sequence.
 *
 * The tiebreak is not cosmetic. Two nodes with equal f must pop in a fixed order or
 * two engines can produce different plans from identical input, which is exactly the
 * divergence docs/03-determinism.md exists to prevent.
 */
class NodeHeap {
  private items: Node[] = [];
  private seq: number[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  private before(a: number, b: number): boolean {
    const fa = (this.items[a] as Node).f;
    const fb = (this.items[b] as Node).f;
    if (fa !== fb) return fa < fb;
    return (this.seq[a] as number) < (this.seq[b] as number);
  }

  private swap(a: number, b: number): void {
    const ti = this.items[a] as Node;
    this.items[a] = this.items[b] as Node;
    this.items[b] = ti;
    const ts = this.seq[a] as number;
    this.seq[a] = this.seq[b] as number;
    this.seq[b] = ts;
  }

  push(node: Node): void {
    this.items.push(node);
    this.seq.push(this.counter++);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): Node | null {
    if (this.items.length === 0) return null;
    const top = this.items[0] as Node;
    const lastItem = this.items.pop() as Node;
    const lastSeq = this.seq.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.seq[0] = lastSeq;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.items.length && this.before(l, best)) best = l;
        if (r < this.items.length && this.before(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }
}

/**
 * True when the action's effects move us toward `required` on at least one bit the
 * agent has not already satisfied — and does not contradict it on any of them.
 */
function actionHelps(action: ActionDef, required: State, unsatisfied: number): boolean {
  const overlap = action.eff.mask & unsatisfied;
  if (overlap === 0) return false;
  return (action.eff.values & overlap) === (required.values & overlap);
}

/** Walks parent pointers from the terminal node to the root, which is forward order. */
function reconstructForward(terminal: Node): PlanResult['steps'] {
  const steps: PlanResult['steps'] = [];
  let node: Node | null = terminal;
  while (node !== null && node.action !== null) {
    steps.push({ action: node.action.id, cost: node.g - (node.parent?.g ?? 0) });
    node = node.parent;
  }
  return steps;
}

export interface PlanOptions {
  budget?: number;
  stats?: PlannerStats;
}

export function plan(
  agent: Agent,
  goalState: State,
  actions: readonly ActionDef[],
  world: WorldView,
  options: PlanOptions = {},
): PlanResult | null {
  const budget = options.budget ?? PLANNER_NODE_BUDGET;
  const stats = options.stats;
  if (stats) stats.attempts++;

  const current = agent.currentState;
  const open = new NodeHeap();
  const seen = new Map<number, number>();
  let expansions = 0;

  const rootUnsatisfied = unsatisfiedMask(current, goalState);
  open.push({
    state: goalState,
    g: 0,
    f: popcount(rootUnsatisfied),
    action: null,
    parent: null,
  });

  // Actions are filtered by class once, up front, rather than inside the loop.
  const available = actions.filter(
    (a) => a.classes === 'all' || (a.classes as readonly string[]).includes(agent.classId),
  );

  while (open.size > 0) {
    if (++expansions > budget) break;

    const node = open.pop() as Node;

    if (satisfies(current, node.state)) {
      if (stats) {
        stats.expansions += expansions;
        stats.misses++;
      }
      const steps = reconstructForward(node);
      let accumulatedMask = 0;
      for (const step of steps) {
        const def = available.find((a) => a.id === step.action);
        if (def !== undefined) accumulatedMask |= def.pre.mask;
      }
      return { steps, totalCost: node.g, accumulatedMask, expansions };
    }

    const unsatisfied = unsatisfiedMask(current, node.state);

    for (const action of available) {
      if (!actionHelps(action, node.state, unsatisfied)) continue;
      if (!action.isValid(agent, world)) continue;

      const childState = regress(node.state, action.pre, action.eff);
      const g = node.g + action.cost(agent, world);

      const key = stateHash(childState);
      const best = seen.get(key);
      if (best !== undefined && best <= g) continue;
      seen.set(key, g);

      open.push({
        state: childState,
        g,
        f: g + popcount(unsatisfiedMask(current, childState)),
        action,
        parent: node,
      });
    }
  }

  if (stats) {
    stats.expansions += expansions;
    stats.nullPlans++;
  }
  return null;
}

export const emptyPlannerStats = (): PlannerStats => ({
  hits: 0,
  misses: 0,
  nullPlans: 0,
  attempts: 0,
  expansions: 0,
});
