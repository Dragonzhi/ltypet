/**
 * Dependency graph utilities for rig part hierarchy.
 * Validates parent-child relationships and computes topological order.
 */

import type { RigPartV1 } from "../types";

/**
 * Computes the topological order of parts based on logicalParentId.
 *
 * Root parts (logicalParentId === null) come first.
 * Throws an error if a cycle is detected.
 *
 * @param parts - All rig parts
 * @returns Parts sorted in topological order (parents before children)
 * @throws {Error} If a cycle is detected
 */
export function topologicalOrder(parts: RigPartV1[]): RigPartV1[] {
  const partMap = new Map<string, RigPartV1>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Build adjacency and in-degree
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>(); // parent -> children

  for (const part of parts) {
    inDegree.set(part.id, 0);
    children.set(part.id, []);
  }

  for (const part of parts) {
    if (part.logicalParentId !== null) {
      if (!partMap.has(part.logicalParentId)) {
        throw new Error(
          `Part "${part.id}" references unknown parent "${part.logicalParentId}"`,
        );
      }
      children.get(part.logicalParentId)!.push(part.id);
      inDegree.set(part.id, (inDegree.get(part.id) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const sorted: RigPartV1[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const part = partMap.get(id)!;
    sorted.push(part);

    for (const childId of children.get(id) ?? []) {
      const newDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, newDeg);
      if (newDeg === 0) {
        queue.push(childId);
      }
    }
  }

  if (sorted.length !== parts.length) {
    throw new Error("Cycle detected in rig part hierarchy");
  }

  return sorted;
}
