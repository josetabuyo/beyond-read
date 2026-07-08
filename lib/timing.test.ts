import { describe, it, expect } from "vitest";
import {
  wordDuration,
  startupRampFactor,
  endingRampFactor,
  scheduledWordDuration,
  buildTimeline,
  AUTO_PACE_MULTIPLIER,
  STARTUP_RAMP_WORDS,
  ENDING_RAMP_WORDS,
  ENDING_SLOWDOWN_FACTOR,
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

describe("endingRampFactor", () => {
  const totalWords = 100;

  it("stays at 1 far from the end", () => {
    expect(endingRampFactor(0, totalWords)).toBe(1);
    expect(endingRampFactor(totalWords - ENDING_RAMP_WORDS - 1, totalWords)).toBe(1);
  });

  it("reaches the full slowdown factor at the very last word", () => {
    expect(endingRampFactor(totalWords - 1, totalWords)).toBe(ENDING_SLOWDOWN_FACTOR);
  });

  it("increases monotonically across the ramp", () => {
    const values = Array.from({ length: ENDING_RAMP_WORDS }, (_, i) =>
      endingRampFactor(totalWords - ENDING_RAMP_WORDS + i, totalWords),
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("defaults to no slowdown when totalWords is omitted", () => {
    expect(endingRampFactor(4, Infinity)).toBe(1);
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

  it("stretches the final words toward the ending slowdown factor", () => {
    const w = word({ text: "casa" });
    const totalWords = 50;
    const lastIndex = totalWords - 1;
    const scheduled = scheduledWordDuration(w, lastIndex, totalWords);
    const base = wordDuration(w);
    expect(scheduled).toBe(Math.round(base * ENDING_SLOWDOWN_FACTOR));
    expect(scheduled).toBeGreaterThan(base);
  });

  it("does not apply the ending ramp when totalWords is omitted", () => {
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
    const n = words.length;
    expect(timeline.starts[1]).toBe(scheduledWordDuration(words[0], 0, n));
    expect(timeline.starts[2]).toBe(
      scheduledWordDuration(words[0], 0, n) + scheduledWordDuration(words[1], 1, n),
    );
    expect(timeline.total).toBe(
      timeline.starts[2] + scheduledWordDuration(words[2], 2, n),
    );
  });

  it("returns zero total for an empty poem", () => {
    const timeline = buildTimeline([]);
    expect(timeline.starts).toEqual([]);
    expect(timeline.total).toBe(0);
  });
});
