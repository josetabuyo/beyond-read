import type { PoemWord } from "./tokenize";

const COMMA_PAUSE = /[,;:—]$/;
const STOP_PAUSE = /[.!?…")»]$/;

/** Slightly slower than a bare reading pace — the previous default rode too close to fast. */
export const AUTO_PACE_MULTIPLIER = 1.15;

/** How many words at the start of a reading ease in from slow to the regular rhythm. */
export const STARTUP_RAMP_WORDS: number = 5;
const STARTUP_RAMP_START_FACTOR = 1.7;

/**
 * How long after reveal the karaoke text starts ticking through words. The
 * relay video, though, starts playing as soon as it's revealed — before this
 * delay elapses — so anything budgeting the video's playback rate against the
 * reading's duration must include this head start too.
 */
export const TEXT_START_DELAY_MS = 1400;

/** The relay video settles at a third of its normal speed once the last word is reached. */
export const ENDING_SLOWDOWN_FACTOR = 3;

/**
 * How long the reading holds on the last word before finishing — matches the
 * CSS fade-out duration so the slow-motion tail and the fade to black finish
 * together, instead of cutting away mid-fade.
 */
export const ENDING_HOLD_MS = 5000;

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

/**
 * Whether word `index` is the last of the reading — the sole trigger for the
 * closing slow motion. The reading pace stays even right up to this point;
 * only the last word holds, so the slow motion never bleeds into earlier words.
 */
export function isFinalWord(index: number, totalWords: number): boolean {
  return index >= totalWords - 1;
}

/**
 * The relay video's playback-rate divisor for word `index` — 1 at every
 * regular pace, and ENDING_SLOWDOWN_FACTOR the instant the last word is
 * reached (a hard cut into slow motion, not a ramp).
 */
export function finalWordSlowdownFactor(index: number, totalWords: number): number {
  return isFinalWord(index, totalWords) ? ENDING_SLOWDOWN_FACTOR : 1;
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
