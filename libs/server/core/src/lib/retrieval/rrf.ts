/**
 * Reciprocal Rank Fusion: merges ranked lists by summing 1 / (k + rank) per item.
 * Rank-based, so it needs no score calibration between BM25-style and vector similarity.
 */
export function reciprocalRankFusion<T>(
  lists: T[][],
  key: (item: T) => string,
  k = 60,
): { item: T; score: number }[] {
  const fused = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const id = key(item);
      const entry = fused.get(id) ?? { item, score: 0 };
      entry.score += 1 / (k + rank + 1);
      fused.set(id, entry);
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
