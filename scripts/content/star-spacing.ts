import { objectTypes } from '@ge/domain';

/**
 * The system view draws every star as a sphere of the star type's system size (0.6 su) times
 * its `scale.system`, whatever its real size. A multiple star placed closer than that draws as
 * overlapping suns (Tatooine did), so a plan fails before anything is sent if two stars of one
 * system are closer than their drawn radii plus this gap, in su.
 */
const MIN_GAP_SU = 0.2;

interface StarCreate {
  name: string;
  parent: string;
  x: number;
  z: number;
  radiusSu: number;
}

const text = (value: unknown) =>
  typeof value === 'object' && value !== null && 'source' in value
    ? String(value.source)
    : String(value);

export function overlappingStars(operations: Record<string, unknown>[]): string[] {
  const starSizeSu = objectTypes.star.size.system;
  const byParent = new Map<string, StarCreate[]>();
  for (const op of operations) {
    const data = op.data as Record<string, unknown> | undefined;
    if (op.op !== 'create' || data?.baseType !== 'star') continue;
    const appearance = data.appearance as { scale?: { system?: number } } | undefined;
    const star: StarCreate = {
      name: text(data.name),
      parent: String(data.parentId),
      x: Number(data.x ?? 0),
      z: Number(data.z ?? 0),
      radiusSu: starSizeSu * (appearance?.scale?.system ?? 1),
    };
    byParent.set(star.parent, [...(byParent.get(star.parent) ?? []), star]);
  }
  const problems: string[] = [];
  for (const stars of byParent.values()) {
    for (const [i, a] of stars.entries()) {
      for (const b of stars.slice(i + 1)) {
        const apartSu = Math.hypot(a.x - b.x, a.z - b.z);
        const neededSu = a.radiusSu + b.radiusSu + MIN_GAP_SU;
        if (apartSu < neededSu) {
          problems.push(
            `${a.name} and ${b.name} are ${apartSu.toFixed(2)} su apart; drawn, they need ${neededSu.toFixed(2)}`,
          );
        }
      }
    }
  }
  return problems;
}
