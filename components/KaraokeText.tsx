"use client";

import { useEffect, useRef } from "react";
import type { Poem } from "@/lib/tokenize";
import styles from "./KaraokeText.module.css";

export default function KaraokeText({
  poem,
  currentIndex,
}: {
  poem: Poem;
  currentIndex: number;
}) {
  const currentRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentIndex]);

  return (
    <div className={styles.column}>
      {poem.lines.map((line, lineIdx) => (
        <p key={lineIdx} className={styles.line}>
          {line.map((word) => {
            const state =
              word.index === currentIndex
                ? "current"
                : word.index < currentIndex
                  ? "past"
                  : "future";
            return (
              <span key={word.index}>
                <span
                  ref={word.index === currentIndex ? currentRef : undefined}
                  className={`${styles.word} ${styles[state]}`}
                >
                  {word.text}
                </span>{" "}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
