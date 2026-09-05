/** A deterministic binary min-heap with an explicit tie-breaker. */
export class PriorityQueue<T> {
  private readonly values: Array<{ value: T; priority: number; order: number }> = [];
  private nextOrder = 0;

  get size(): number {
    return this.values.length;
  }

  push(value: T, priority: number): void {
    const entry = { value, priority, order: this.nextOrder++ };
    this.values.push(entry);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): T | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length > 0 && last !== undefined) {
      this.values[0] = last;
      this.bubbleDown(0);
    }
    return first?.value;
  }

  private before(a: { priority: number; order: number }, b: { priority: number; order: number }): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.order < b.order);
  }

  private bubbleUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(this.values[index]!, this.values[parent]!)) return;
      [this.values[index], this.values[parent]] = [this.values[parent]!, this.values[index]!];
      index = parent;
    }
  }

  private bubbleDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.values.length && this.before(this.values[left]!, this.values[best]!)) best = left;
      if (right < this.values.length && this.before(this.values[right]!, this.values[best]!)) best = right;
      if (best === index) return;
      [this.values[index], this.values[best]] = [this.values[best]!, this.values[index]!];
      index = best;
    }
  }
}
