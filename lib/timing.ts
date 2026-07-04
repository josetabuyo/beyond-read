import type { PoemWord } from "./tokenize";

const COMMA_PAUSE = /[,;:—]$/;
const STOP_PAUSE = /[.!?…")»]$/;

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
  return clampedBase + pause;
}
