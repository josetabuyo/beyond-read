"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Poem } from "@/lib/tokenize";
import {
  buildTimeline,
  finalWordSlowdownFactor,
  startupSlowdownFactor,
  TEXT_START_DELAY_MS,
} from "@/lib/timing";
import { useCamera } from "./hooks/useCamera";
import { useRecorder } from "./hooks/useRecorder";
import { useKaraoke } from "./hooks/useKaraoke";
import KaraokeText from "./KaraokeText";
import RelayVideoBackground from "./RelayVideoBackground";
import { useTransitionVeil } from "./TransitionVeil";
import styles from "./ReaderStage.module.css";

type Phase = "loading" | "reading" | "uploading" | "error";

export default function ReaderStage({ poem }: { poem: Poem }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [relayVideoUrl, setRelayVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [textActive, setTextActive] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [startupElapsedMs, setStartupElapsedMs] = useState(0);

  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const savePromiseRef = useRef<Promise<Blob | null> | null>(null);

  const camera = useCamera();
  const recorder = useRecorder();
  const veil = useTransitionVeil();

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
    // Lifts the veil left over from the menu at the same moment the relay
    // video starts its own fade-in, so the two blend into one soft reveal.
    veil.reveal();
    window.setTimeout(() => setTextActive(true), TEXT_START_DELAY_MS);
  }, [camera.stream, videoReady, phase, recorder, veil]);

  // Tracks real elapsed time since reveal so the relay video can ease out of
  // its opening slow motion in step with the wall clock — not the word
  // timeline, which hasn't started ticking yet during this window.
  useEffect(() => {
    if (!revealed) return;

    let frame: number;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      setStartupElapsedMs(elapsed);
      if (elapsed < TEXT_START_DELAY_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  // The reading holds on the last word for ENDING_HOLD_MS while the video
  // eases into slow motion and the screen fades to black. Stopping the
  // recorder and uploading right away — instead of waiting for that hold to
  // elapse — spends the hold's time on the save, so there's nothing left to
  // wait on once the fade actually completes.
  const startSaving = useCallback(() => {
    if (savePromiseRef.current) return;
    setPhase("uploading");
    savePromiseRef.current = recorder.stop();
    camera.stop();
  }, [camera, recorder]);

  const finishReading = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    startSaving();
    const blob = await savePromiseRef.current;

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
  }, [poem.id, router, startSaving]);

  const karaoke = useKaraoke(poem.words, textActive, finishReading);

  // Start fading to black as soon as the last word lights up, so the relay
  // video never lingers frozen on a paused face once the reading ends — and
  // kick off the save immediately, so the upload runs during the fade
  // instead of adding its own delay afterward.
  useEffect(() => {
    if (textActive && karaoke.index >= poem.words.length - 1) {
      setFinishing(true);
      startSaving();
    }
  }, [textActive, karaoke.index, poem.words.length, startSaving]);

  const wordFraction =
    timeline.total > 0 ? timeline.starts[karaoke.index] / timeline.total : 0;
  const endingSlowFactor =
    poem.words.length > 0 ? finalWordSlowdownFactor(karaoke.index, poem.words.length) : 1;
  const startingSlowFactor = startupSlowdownFactor(startupElapsedMs);

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
        startingSlowFactor={startingSlowFactor}
        onReady={onVideoReady}
      />

      {textActive && (
        <div className={`${styles.textLayer} ${finishing ? styles.textFading : ""}`}>
          <KaraokeText poem={poem} currentIndex={karaoke.index} />
        </div>
      )}

      {phase === "uploading" && !finishing && (
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
