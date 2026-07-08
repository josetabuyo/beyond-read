"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoemWord } from "@/lib/tokenize";
import { scheduledWordDuration, ENDING_HOLD_MS } from "@/lib/timing";

export type KaraokeMode = "auto" | "manual";

export function useKaraoke(
  words: PoemWord[],
  active: boolean,
  onFinish: () => void,
) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<KaraokeMode>("auto");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Exactly one pending timeout exists at any moment, and only while mode === 'auto'.
  useEffect(() => {
    if (!active || mode !== "auto" || words.length === 0) return;

    const i = indexRef.current;
    const isLast = i >= words.length - 1;

    timerRef.current = setTimeout(
      () => {
        if (isLast) {
          onFinishRef.current();
        } else {
          setIndex((prev) => prev + 1);
        }
      },
      isLast ? ENDING_HOLD_MS : scheduledWordDuration(words[i], i),
    );

    return clearTimer;
  }, [active, mode, index, words, clearTimer]);

  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        clearTimer();
        setMode("manual");
        setIndex((prev) => {
          if (prev >= words.length - 1) {
            onFinishRef.current();
            return prev;
          }
          return prev + 1;
        });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        clearTimer();
        setMode("manual");
        setIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.code === "Space") {
        event.preventDefault();
        setMode((prev) => (prev === "manual" ? "auto" : "manual"));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, words.length, clearTimer]);

  return { index, mode };
}
