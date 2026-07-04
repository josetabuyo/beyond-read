"use client";

import { useEffect, useRef } from "react";
import styles from "./RelayVideoBackground.module.css";

export default function RelayVideoBackground({
  relayUrl,
  liveStream,
}: {
  relayUrl: string | null;
  liveStream: MediaStream | null;
}) {
  const liveRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.srcObject = liveStream;
    }
  }, [liveStream]);

  const hasRelay = Boolean(relayUrl);

  return (
    <div className={styles.stack}>
      {hasRelay && (
        <video
          className={styles.relay}
          src={relayUrl ?? undefined}
          autoPlay
          muted
          playsInline
        />
      )}
      <video
        ref={liveRef}
        className={`${styles.live} ${hasRelay ? styles.liveBlended : styles.liveSolo}`}
        autoPlay
        muted
        playsInline
      />
      <div className={styles.scrim} />
    </div>
  );
}
