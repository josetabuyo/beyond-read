"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Poem } from "@/lib/tokenize";
import { buildTimeline, endingRampFactor } from "@/lib/timing";
import { useCamera } from "./hooks/useCamera";
import { useRecorder } from "./hooks/useRecorder";
import { useKaraoke } from "./hooks/useKaraoke";
import KaraokeText from "./KaraokeText";
import RelayVideoBackground from "./RelayVideoBackground";
import styles from "./ReaderStage.module.css";

type Phase = "loading" | "reading" | "uploading" | "error";

const TEXT_START_DELAY_MS = 1400;
// Matches the CSS opacity transition on the relay video / text layers, plus a
// small buffer — guarantees we never navigate away mid-fade, however fast the
// recording upload resolves.
const FADE_HOLD_MS = 1800;

export default function ReaderStage({ poem }: { poem: Poem }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [relayVideoUrl, setRelayVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [textActive, setTextActive] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const camera = useCamera();
  const recorder = useRecorder();

  const timeline = useMemo(() => buildTimeline(poem.words), [poem.words]);

  // Kick off camera permission and relay-video claim in parallel, as soon as the page mounts.
  useEffect(() => {
    let cancelled = false;

    camera.start().then((stream) => {
      if (!cancelled && !stream) setPhase("error");
    });

    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poemId: poem.id }),
    })
      .then((res) => (res.ok ? res.json() : { relayVideoUrl: null }))
      .then((data) => {
        if (!cancelled) setRelayVideoUrl(data.relayVideoUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setRelayVideoUrl(null);
      });

    return () => {
      cancelled = true;
      if (!finishedRef.current) camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem.id]);

  const onVideoReady = useCallback(() => setVideoReady(true), []);

  // Once the camera stream and the relay video (if any) are both fully ready,
  // start recording and reveal the background — no rush, everything is buffered first.
  useEffect(() => {
    if (startedRef.current) return;
    if (phase !== "loading") return;
    if (!camera.stream || !videoReady) return;

    startedRef.current = true;
    recorder.start(camera.stream);
    setPhase("reading");
    setRevealed(true);
    window.setTimeout(() => setTextActive(true), TEXT_START_DELAY_MS);
  }, [camera.stream, videoReady, phase, recorder]);

  const finishReading = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    setPhase("uploading");
    const holdUntilBlack = new Promise((resolve) => setTimeout(resolve, FADE_HOLD_MS));
    const [blob] = await Promise.all([recorder.stop(), holdUntilBlack]);
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

  const karaoke = useKaraoke(poem.words, textActive, finishReading);

  // Start fading to black as soon as the last word lights up, so the relay
  // video never lingers frozen on a paused face once the reading ends.
  useEffect(() => {
    if (textActive && karaoke.index >= poem.words.length - 1) {
      setFinishing(true);
    }
  }, [textActive, karaoke.index, poem.words.length]);

  const wordFraction =
    timeline.total > 0 ? timeline.starts[karaoke.index] / timeline.total : 0;
  const endingSlowFactor =
    poem.words.length > 0 ? endingRampFactor(karaoke.index, poem.words.length) : 1;

  return (
    <main className={styles.stage}>
      <RelayVideoBackground
        relayUrl={relayVideoUrl}
        wordFraction={wordFraction}
        totalReadingMs={timeline.total}
        mode={karaoke.mode}
        revealed={revealed}
        fading={finishing}
        endingSlowFactor={endingSlowFactor}
        onReady={onVideoReady}
      />

      {textActive && (
        <div className={`${styles.textLayer} ${finishing ? styles.textFading : ""}`}>
          <KaraokeText poem={poem} currentIndex={karaoke.index} />
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

      {textActive && !finishing && (
        <p className={styles.hint}>← → navegar · espacio pausar / seguir</p>
      )}
    </main>
  );
}
