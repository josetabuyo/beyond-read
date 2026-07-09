"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import type { PoemSummary } from "@/lib/poems";
import { MENU_COVER_MS } from "@/lib/timing";
import { useTransitionVeil } from "./TransitionVeil";
import styles from "./PoemSelector.module.css";

export default function PoemSelector({ poems }: { poems: PoemSummary[] }) {
  const router = useRouter();
  const veil = useTransitionVeil();
  const leavingRef = useRef(false);

  // Cover the menu with the shared veil, slowly, before handing off to the
  // reading — the veil persists across the navigation, so the menu dissolving
  // away and the relay video fading in (once ReaderStage reveals it) read as
  // one continuous transition instead of two separate fades with a gap.
  const openPoem = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (leavingRef.current) return;
    leavingRef.current = true;
    veil.cover();
    window.setTimeout(() => router.push(`/read/${id}`), MENU_COVER_MS);
  };

  return (
    <main className={styles.page}>
      <p className={styles.kicker}>beyond read</p>

      {CATEGORIES.map(({ key, label }) => {
        const inCategory = poems.filter((p) => p.category === key);
        if (inCategory.length === 0) return null;

        return (
          <section key={key} className={styles.section}>
            <p className={styles.sectionLabel}>{label}</p>
            <ul className={styles.list}>
              {inCategory.map((poem) => (
                <li key={poem.id}>
                  <a
                    href={`/read/${poem.id}`}
                    className={styles.title}
                    onClick={openPoem(poem.id)}
                  >
                    {poem.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <p className={styles.hint}>elegí un poema. tu lectura queda para el próximo.</p>
    </main>
  );
}
