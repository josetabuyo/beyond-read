import Link from "next/link";
import type { PoemSummary } from "@/lib/poems";
import styles from "./PoemSelector.module.css";

export default function PoemSelector({ poems }: { poems: PoemSummary[] }) {
  return (
    <main className={styles.page}>
      <p className={styles.kicker}>beyond read</p>
      <ul className={styles.list}>
        {poems.map((poem) => (
          <li key={poem.id}>
            <Link href={`/read/${poem.id}`} className={styles.title}>
              {poem.title}
            </Link>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>elegí un poema. tu lectura queda para el próximo.</p>
    </main>
  );
}
