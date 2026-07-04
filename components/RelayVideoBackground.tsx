"use client";

import styles from "./RelayVideoBackground.module.css";

export default function RelayVideoBackground({
  relayUrl,
}: {
  relayUrl: string | null;
}) {
  return (
    <div className={styles.stack}>
      {relayUrl && (
        <video
          className={styles.relay}
          src={relayUrl}
          autoPlay
          muted
          playsInline
        />
      )}
      <div className={styles.scrim} />
    </div>
  );
}
