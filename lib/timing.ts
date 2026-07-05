import type { PoemWord } from "./tokenize";

const COMMA_PAUSE = /[,;:—]$/;
const STOP_PAUSE = /[.!?…")»]$/;

/** Slightly slower than a bare reading pace — the previous default rode too close to fast. */
export const AUTO_PACE_MULTIPLIER = 1.15;

/** How many words at the start of a reading ease in from slow to the regular rhythm. */
export const STARTUP_RAMP_WORDS: number = 5;
const STARTUP_RAMP_START_FACTOR = 1.7;

function lettersOnly(text: string): string {
  return text.replace(/[^\p{L}]/gu, "");
}

export function wordDuration(word: PoemWord): number {
  const letters = lettersOnly(word.text).length;
  const base = 250 + 30 * Math.max(0, letters - 3);

  let pause = 0;
  if (COMMA_PAUSE.test(word.text)) pause += 300;
  if (STOP_PAUSE.test(word.text)) pause += 550;
  if (word.isLineEnd && pause < 300) pause += 280;
  if (word.isStanzaEnd) pause += 650;

  const clampedBase = Math.min(900, Math.max(250, base));
  return Math.round((clampedBase + pause) * AUTO_PACE_MULTIPLIER);
}

/**
 * Multiplier easing the very first words of a reading from slow to the
 * regular rhythm — a gentle ramp-up rather than starting at full pace.
 */
export function startupRampFactor(index: number): number {
  if (index >= STARTUP_RAMP_WORDS) return 1;
  const t = STARTUP_RAMP_WORDS === 1 ? 1 : index / (STARTUP_RAMP_WORDS - 1);
  return STARTUP_RAMP_START_FACTOR - (STARTUP_RAMP_START_FACTOR - 1) * t;
}

/** The duration actually scheduled by the reading engine for word `index`. */
export function scheduledWordDuration(word: PoemWord, index: number): number {
  return Math.round(wordDuration(word) * startupRampFactor(index));
}

export interface WordTimeline {
  /** Time (ms) at which word i begins, measured from the start of the reading. */
  starts: number[];
  /** Total scheduled duration (ms) of the whole reading. */
  total: number;
}

export function buildTimeline(words: PoemWord[]): WordTimeline {
  const starts: number[] = [];
  let elapsed = 0;
  for (let i = 0; i < words.length; i++) {
    starts.push(elapsed);
    elapsed += scheduledWordDuration(words[i], i);
  }
  return { starts, total: elapsed };
}
