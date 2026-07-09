"use client";

import { createContext, useCallback, useContext, useState } from "react";
import styles from "./TransitionVeil.module.css";

interface TransitionVeilContextValue {
  /** Fades the veil to opaque black, slowly — the menu dissolving away. */
  cover: () => void;
  /** Fades the veil back to transparent, slowly — blending into whatever is now underneath. */
  reveal: () => void;
}

const TransitionVeilContext = createContext<TransitionVeilContextValue | null>(null);

/**
 * A black overlay that lives in the root layout, so it survives route
 * navigation. Covering the veil before navigating and revealing it once the
 * next page is ready turns two separate fades (menu-out, then video-in) into
 * one continuous dissolve, with the page swap hidden underneath.
 */
export function TransitionVeilProvider({ children }: { children: React.ReactNode }) {
  const [covered, setCovered] = useState(false);

  const cover = useCallback(() => setCovered(true), []);
  const reveal = useCallback(() => setCovered(false), []);

  return (
    <TransitionVeilContext.Provider value={{ cover, reveal }}>
      {children}
      <div aria-hidden className={`${styles.veil} ${covered ? styles.covered : ""}`} />
    </TransitionVeilContext.Provider>
  );
}

export function useTransitionVeil(): TransitionVeilContextValue {
  const ctx = useContext(TransitionVeilContext);
  if (!ctx) throw new Error("useTransitionVeil must be used within TransitionVeilProvider");
  return ctx;
}
