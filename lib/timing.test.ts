import { describe, it, expect } from "vitest";
import {
  wordDuration,
  startupRampFactor,
  isFinalWord,
  finalWordSlowdownFactor,
  scheduledWordDuration,
  buildTimeline,
  startupSlowdownFactor,
  imageRevealDurationMs,
  AUTO_PACE_MULTIPLIER,
  STARTUP_RAMP_WORDS,
  ENDING_SLOWDOWN_FACTOR,
  STARTUP_SLOWDOWN_FACTOR,
  TEXT_START_DELAY_MS,
  IMAGE_REVEAL_FRACTION,
} from "./timing";
import type { PoemWord } from "./tokenize";

function word(overrides: Partial<PoemWord>): PoemWord {
  return {
    text: "hola",
    index: 0,
    lineIndex: 0,
    isLineEnd: false,
    isStanzaEnd: false,
    ...overrides,
  };
}

function paced(rawMs: number): number {
  return Math.round(rawMs * AUTO_PACE_MULTIPLIER);
}

describe("wordDuration", () => {
  it("uses the base duration for a short plain word", () => {
    expect(wordDuration(word({ text: "el" }))).toBe(paced(250));
  });

  it("grows with word length beyond 3 letters", () => {
    const short = wordDuration(word({ text: "sol" }));
    const long = wordDuration(word({ text: "extraordinario" }));
    expect(long).toBeGreaterThan(short);
  });

  it("clamps the base duration at 900ms before adding pauses", () => {
    const huge = word({ text: "a".repeat(50) });
    expect(wordDuration(huge)).toBe(paced(900));
  });

  it("adds a comma-class pause for trailing punctuation", () => {
    const plain = wordDuration(word({ text: "casa" }));
    const withComma = wordDuration(word({ text: "casa," }));
    expect(withComma).toBe(paced(280 + 300));
    expect(plain).toBe(paced(280));
  });

  it("adds a stop-class pause for sentence-ending punctuation", () => {
    const withStop = wordDuration(word({ text: "casa." }));
    expect(withStop).toBe(paced(280 + 550));
  });

  it("adds a line-end pause only when no larger pause already applies", () => {
    // "casa" has 4 letters -> base = 250 + 30*(4-3) = 280.
    const lineEnd = wordDuration(word({ text: "casa", isLineEnd: true }));
    expect(lineEnd).toBe(paced(280 + 280));

    // Stop-class pause (550) already exceeds the 300 threshold, so no extra line-end pause is added.
    const lineEndWithStop = wordDuration(
      word({ text: "casa.", isLineEnd: true }),
    );
    expect(lineEndWithStop).toBe(paced(280 + 550));
  });

  it("stacks the stanza-end pause on top of everything else", () => {
    const stanzaEnd = wordDuration(
      word({ text: "casa", isLineEnd: true, isStanzaEnd: true }),
    );
    expect(stanzaEnd).toBe(paced(280 + 280 + 650));
  });
});

describe("startupRampFactor", () => {
  it("starts above 1 (slower) at index 0", () => {
    expect(startupRampFactor(0)).toBeGreaterThan(1);
  });

  it("eases down to exactly 1 by the last ramp word", () => {
    expect(startupRampFactor(STARTUP_RAMP_WORDS - 1)).toBe(1);
  });

  it("stays at 1 for every word after the ramp", () => {
    expect(startupRampFactor(STARTUP_RAMP_WORDS)).toBe(1);
    expect(startupRampFactor(STARTUP_RAMP_WORDS + 10)).toBe(1);
  });

  it("decreases monotonically across the ramp", () => {
    const values = Array.from({ length: STARTUP_RAMP_WORDS }, (_, i) =>
      startupRampFactor(i),
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });
});

describe("isFinalWord", () => {
  const totalWords = 20;

  it("is false for every word before the last", () => {
    expect(isFinalWord(0, totalWords)).toBe(false);
    expect(isFinalWord(totalWords - 2, totalWords)).toBe(false);
  });

  it("is true only at the last word", () => {
    expect(isFinalWord(totalWords - 1, totalWords)).toBe(true);
  });
});

describe("finalWordSlowdownFactor", () => {
  const totalWords = 20;

  it("stays at 1 for every word before the last — no early ramp", () => {
    expect(finalWordSlowdownFactor(0, totalWords)).toBe(1);
    expect(finalWordSlowdownFactor(totalWords - 2, totalWords)).toBe(1);
  });

  it("jumps straight to the full slowdown factor at the last word", () => {
    expect(finalWordSlowdownFactor(totalWords - 1, totalWords)).toBe(ENDING_SLOWDOWN_FACTOR);
  });
});

describe("startupSlowdownFactor", () => {
  it("starts at the full slowdown factor right at reveal — the opening mirror of the ending", () => {
    expect(startupSlowdownFactor(0)).toBe(STARTUP_SLOWDOWN_FACTOR);
  });

  it("eases linearly down to 1 as the reading's start delay elapses", () => {
    const half = startupSlowdownFactor(TEXT_START_DELAY_MS / 2);
    expect(half).toBeCloseTo((STARTUP_SLOWDOWN_FACTOR + 1) / 2);
  });

  it("settles at 1 exactly when the reading starts ticking, and stays there", () => {
    expect(startupSlowdownFactor(TEXT_START_DELAY_MS)).toBe(1);
    expect(startupSlowdownFactor(TEXT_START_DELAY_MS + 5000)).toBe(1);
  });
});

describe("imageRevealDurationMs", () => {
  it("stretches the fade-in across IMAGE_REVEAL_FRACTION of the reading", () => {
    expect(imageRevealDurationMs(90000)).toBe(90000 * IMAGE_REVEAL_FRACTION);
  });

  it("floors short poems at TEXT_START_DELAY_MS instead of an imperceptible flash", () => {
    expect(imageRevealDurationMs(300)).toBe(TEXT_START_DELAY_MS);
    expect(imageRevealDurationMs(0)).toBe(TEXT_START_DELAY_MS);
  });
});

describe("scheduledWordDuration", () => {
  it("applies the startup ramp on top of the base duration", () => {
    const w = word({ text: "casa" });
    const scheduled = scheduledWordDuration(w, 0);
    const base = wordDuration(w);
    expect(scheduled).toBe(Math.round(base * startupRampFactor(0)));
    expect(scheduled).toBeGreaterThan(base);
  });

  it("matches the base duration once past the ramp", () => {
    const w = word({ text: "casa" });
    expect(scheduledWordDuration(w, STARTUP_RAMP_WORDS)).toBe(wordDuration(w));
  });

  it("stays at the regular pace for the last word too — the hold, not the duration, carries the slowdown", () => {
    const w = word({ text: "casa" });
    expect(scheduledWordDuration(w, STARTUP_RAMP_WORDS)).toBe(wordDuration(w));
  });
});

describe("buildTimeline", () => {
  it("returns a start time of 0 for the first word", () => {
    const words = [word({ text: "uno", index: 0 }), word({ text: "dos", index: 1 })];
    const timeline = buildTimeline(words);
    expect(timeline.starts[0]).toBe(0);
  });

  it("accumulates scheduled durations across words", () => {
    const words = [
      word({ text: "uno", index: 0 }),
      word({ text: "dos", index: 1 }),
      word({ text: "tres", index: 2 }),
    ];
    const timeline = buildTimeline(words);
    expect(timeline.starts[1]).toBe(scheduledWordDuration(words[0], 0));
    expect(timeline.starts[2]).toBe(
      scheduledWordDuration(words[0], 0) + scheduledWordDuration(words[1], 1),
    );
    expect(timeline.total).toBe(
      timeline.starts[2] + scheduledWordDuration(words[2], 2),
    );
  });

  it("returns zero total for an empty poem", () => {
    const timeline = buildTimeline([]);
    expect(timeline.starts).toEqual([]);
    expect(timeline.total).toBe(0);
  });
});
