import Link from "next/link";
import { CATEGORIES, type PoemSummary } from "@/lib/poems";
import styles from "./PoemSelector.module.css";

export default function PoemSelector({ poems }: { poems: PoemSummary[] }) {
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
                  <Link href={`/read/${poem.id}`} className={styles.title}>
                    {poem.title}
                  </Link>
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
