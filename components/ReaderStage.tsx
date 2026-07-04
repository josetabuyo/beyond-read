"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Poem } from "@/lib/tokenize";
import { useCamera } from "./hooks/useCamera";
import { useRecorder } from "./hooks/useRecorder";
import { useKaraoke } from "./hooks/useKaraoke";
import KaraokeText from "./KaraokeText";
import RelayVideoBackground from "./RelayVideoBackground";
import styles from "./ReaderStage.module.css";

type Phase = "begin" | "requesting-camera" | "reading" | "uploading" | "error";

const BEAT_MS = 1500;

export default function ReaderStage({ poem }: { poem: Poem }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("begin");
  const [relayVideoUrl, setRelayVideoUrl] = useState<string | null>(null);
  const finishedRef = useRef(false);

  const camera = useCamera();
  const recorder = useRecorder();

  useEffect(() => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poemId: poem.id }),
    })
      .then((res) => (res.ok ? res.json() : { relayVideoUrl: null }))
      .then((data) => setRelayVideoUrl(data.relayVideoUrl ?? null))
      .catch(() => setRelayVideoUrl(null));
  }, [poem.id]);

  const finishReading = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    setPhase("uploading");
    const blob = await recorder.stop();
    camera.stop();

    if (blob) {
      try {
        await fetch("/api/recordings", {
          method: "POST",
          headers: {
            "Content-Type": "video/webm",
            "x-poem-id": poem.id,
          },
          body: blob,
        });
      } catch (err) {
        console.warn("no se pudo subir la grabación", err);
      }
    }

    router.push("/");
  }, [camera, poem.id, recorder, router]);

  const karaoke = useKaraoke(poem.words, phase === "reading", finishReading);

  const begin = useCallback(async () => {
    setPhase("requesting-camera");
    const stream = await camera.start();
    if (!stream) {
      setPhase("error");
      return;
    }
    recorder.start(stream);
    window.setTimeout(() => setPhase("reading"), BEAT_MS);
  }, [camera, recorder]);

  return (
    <main className={styles.stage}>
      <RelayVideoBackground relayUrl={relayVideoUrl} />

      {(phase === "reading" || phase === "uploading") && (
        <KaraokeText poem={poem} currentIndex={karaoke.index} />
      )}

      {phase === "begin" && (
        <div className={styles.overlay}>
          <button className={styles.beginButton} onClick={begin}>
            comenzar
          </button>
        </div>
      )}

      {phase === "requesting-camera" && (
        <div className={styles.overlay}>
          <p className={styles.overlayText}>activando cámara…</p>
        </div>
      )}

      {phase === "uploading" && (
        <div className={styles.overlay}>
          <p className={styles.overlayText}>guardando…</p>
        </div>
      )}

      {phase === "error" && (
        <div className={styles.overlay}>
          <p className={styles.overlayText}>{camera.error ?? "algo salió mal"}</p>
          <a className={styles.backLink} href="/">
            volver
          </a>
        </div>
      )}

      {phase === "reading" && (
        <p className={styles.hint}>← → navegar · espacio pausar / seguir</p>
      )}
    </main>
  );
}
