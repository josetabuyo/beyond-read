import { describe, it, expect } from "vitest";
import { wordDuration } from "./timing";
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

describe("wordDuration", () => {
  it("uses the base duration for a short plain word", () => {
    expect(wordDuration(word({ text: "el" }))).toBe(250);
  });

  it("grows with word length beyond 3 letters", () => {
    const short = wordDuration(word({ text: "sol" }));
    const long = wordDuration(word({ text: "extraordinario" }));
    expect(long).toBeGreaterThan(short);
  });

  it("clamps the base duration at 900ms before adding pauses", () => {
    const huge = word({ text: "a".repeat(50) });
    expect(wordDuration(huge)).toBe(900);
  });

  it("adds a comma-class pause for trailing punctuation", () => {
    const plain = wordDuration(word({ text: "casa" }));
    const withComma = wordDuration(word({ text: "casa," }));
    expect(withComma).toBe(plain + 300);
  });

  it("adds a stop-class pause for sentence-ending punctuation", () => {
    const plain = wordDuration(word({ text: "casa" }));
    const withStop = wordDuration(word({ text: "casa." }));
    expect(withStop).toBe(plain + 550);
  });

  it("adds a line-end pause only when no larger pause already applies", () => {
    // "casa" has 4 letters -> base = 250 + 30*(4-3) = 280.
    const lineEnd = wordDuration(word({ text: "casa", isLineEnd: true }));
    expect(lineEnd).toBe(280 + 280);

    // Stop-class pause (550) already exceeds the 300 threshold, so no extra line-end pause is added.
    const lineEndWithStop = wordDuration(
      word({ text: "casa.", isLineEnd: true }),
    );
    expect(lineEndWithStop).toBe(280 + 550);
  });

  it("stacks the stanza-end pause on top of everything else", () => {
    const stanzaEnd = wordDuration(
      word({ text: "casa", isLineEnd: true, isStanzaEnd: true }),
    );
    expect(stanzaEnd).toBe(280 + 280 + 650);
  });
});
