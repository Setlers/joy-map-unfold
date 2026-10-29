import type { EmotionKey } from "./emotions";

export function summarizeEmotions(rows: readonly { emotion: EmotionKey }[]) {
  if (rows.length === 0) return null;
  const counts: Record<EmotionKey, number> = {
    joy: 0,
    calm: 0,
    sadness: 0,
    anger: 0,
    anxiety: 0,
    hope: 0,
  };
  for (const row of rows) counts[row.emotion]++;
  const count = Math.max(...Object.values(counts));
  const keys = (Object.keys(counts) as EmotionKey[]).filter((key) => counts[key] === count);
  return { keys, count, total: rows.length };
}
