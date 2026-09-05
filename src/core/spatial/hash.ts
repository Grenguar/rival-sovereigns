import type { EntityId } from '../types';

export const SPATIAL_BUCKET_SIZE = 64;

interface Entry {
  x: number;
  y: number;
  bucket: string;
}

/** Incrementally maintained pixel-space broad phase for sensor proximity queries. */
export class SpatialHash {
  private readonly buckets = new Map<string, Set<EntityId>>();
  private readonly entries = new Map<EntityId, Entry>();

  get size(): number {
    return this.entries.size;
  }

  insert(id: EntityId, x: number, y: number): void {
    if (this.entries.has(id)) throw new Error(`Entity ${id} is already in the spatial hash.`);
    const bucket = bucketKey(x, y);
    this.entries.set(id, { x, y, bucket });
    this.addToBucket(bucket, id);
  }

  update(id: EntityId, x: number, y: number): void {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new Error(`Entity ${id} is not in the spatial hash.`);
    const bucket = bucketKey(x, y);
    if (bucket !== entry.bucket) {
      this.removeFromBucket(entry.bucket, id);
      this.addToBucket(bucket, id);
      entry.bucket = bucket;
    }
    entry.x = x;
    entry.y = y;
  }

  remove(id: EntityId): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    this.removeFromBucket(entry.bucket, id);
    this.entries.delete(id);
    return true;
  }

  queryRadius(x: number, y: number, radius: number): EntityId[] {
    if (radius < 0) return [];
    const radiusSquared = radius * radius;
    const candidates = this.queryBounds(x - radius, y - radius, x + radius, y + radius);
    return candidates.filter((id) => {
      const entry = this.entries.get(id) as Entry;
      const dx = entry.x - x;
      const dy = entry.y - y;
      return dx * dx + dy * dy <= radiusSquared;
    });
  }

  queryBounds(minX: number, minY: number, maxX: number, maxY: number): EntityId[] {
    const ids = new Set<EntityId>();
    const minBucketX = Math.floor(minX / SPATIAL_BUCKET_SIZE);
    const maxBucketX = Math.floor(maxX / SPATIAL_BUCKET_SIZE);
    const minBucketY = Math.floor(minY / SPATIAL_BUCKET_SIZE);
    const maxBucketY = Math.floor(maxY / SPATIAL_BUCKET_SIZE);
    for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY++) {
      for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX++) {
        const bucket = this.buckets.get(`${bucketX},${bucketY}`);
        if (bucket === undefined) continue;
        for (const id of bucket) ids.add(id);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }

  private addToBucket(bucket: string, id: EntityId): void {
    let members = this.buckets.get(bucket);
    if (members === undefined) {
      members = new Set<EntityId>();
      this.buckets.set(bucket, members);
    }
    members.add(id);
  }

  private removeFromBucket(bucket: string, id: EntityId): void {
    const members = this.buckets.get(bucket);
    if (members === undefined) return;
    members.delete(id);
    if (members.size === 0) this.buckets.delete(bucket);
  }
}

function bucketKey(x: number, y: number): string {
  return `${Math.floor(x / SPATIAL_BUCKET_SIZE)},${Math.floor(y / SPATIAL_BUCKET_SIZE)}`;
}
