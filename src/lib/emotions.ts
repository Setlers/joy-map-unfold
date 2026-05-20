export type EmotionKey =
  | "joy"
  | "calm"
  | "sadness"
  | "anger"
  | "anxiety"
  | "hope";

export interface EmotionMeta {
  key: EmotionKey;
  label: string;
  emoji: string;
  /** CSS variable name (without var()) used for color */
  cssVar: string;
}

export const EMOTIONS: EmotionMeta[] = [
  { key: "joy",     label: "Joy",     emoji: "😄", cssVar: "--emotion-joy" },
  { key: "calm",    label: "Calm",    emoji: "😌", cssVar: "--emotion-calm" },
  { key: "sadness", label: "Sadness", emoji: "😢", cssVar: "--emotion-sadness" },
  { key: "anger",   label: "Anger",   emoji: "😠", cssVar: "--emotion-anger" },
  { key: "anxiety", label: "Anxiety", emoji: "😰", cssVar: "--emotion-anxiety" },
  { key: "hope",    label: "Hope",    emoji: "🌱", cssVar: "--emotion-hope" },
];

export const EMOTIONS_BY_KEY: Record<EmotionKey, EmotionMeta> = Object.fromEntries(
  EMOTIONS.map((e) => [e.key, e]),
) as Record<EmotionKey, EmotionMeta>;
