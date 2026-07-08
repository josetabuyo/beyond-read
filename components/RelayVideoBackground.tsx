"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RelayVideoBackground.module.css";

const READY_TIMEOUT_MS = 6000;
const MIN_PLAYBACK_RATE = 0.4;
const MAX_PLAYBACK_RATE = 2.5;
const RESEEK_THRESHOLD_S = 0.12;
// MediaRecorder-produced webm often reports duration as Infinity until the
// browser is forced to compute it — a well-known Chromium quirk. Seeking far
// past the end triggers a real duration to be resolved via `durationchange`.
const DURATION_FIX_SEEK_S = 1e7;

export default function RelayVideoBackground({
  relayUrl,
  wordFraction,
  totalReadingMs,
  mode,
  revealed,
  fading,
  onReady,
}: {
  relayUrl: string | null;
  /** Fraction (0-1) of the reading elapsed, per the auto-play time reference. */
  wordFraction: number;
  totalReadingMs: number;
  mode: "auto" | "manual";
  /** Once true, the relay video fades in from black. */
  revealed: boolean;
  /** Once true, the relay video fades back out to black. */
  fading: boolean;
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number | null>(null);

  // No relay video to preload (first reader of this poem) — proceed immediately.
  useEffect(() => {
    if (!relayUrl) onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !relayUrl) return;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      onReady();
    };

    video.addEventListener("canplaythrough", settle);
    const timeout = window.setTimeout(settle, READY_TIMEOUT_MS);

    return () => {
      video.removeEventListener("canplaythrough", settle);
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayUrl]);

  // Resolve a real, finite duration — working around browsers reporting
  // Infinity for locally-recorded webm until forced to compute it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !relayUrl) return;

    let cancelled = false;

    const resolve = (value: number) => {
      if (!cancelled) setDuration(value);
    };

    const onLoadedMetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        resolve(video.duration);
        return;
      }

      const onTimeUpdate = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.currentTime = 0;
          resolve(video.duration);
        }
      };
      video.addEventListener("timeupdate", onTimeUpdate);
      video.currentTime = DURATION_FIX_SEEK_S;
    };

    if (video.readyState >= 1) {
      onLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", onLoadedMetadata);
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [relayUrl]);

  // Stretch or compress the relay video so its full length spans this reading's duration.
  useEffect(() => {
    if (duration === null || totalReadingMs <= 0) return;
    const rate = (duration * 1000) / totalReadingMs;
    setPlaybackRate(Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate)));
  }, [duration, totalReadingMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && playbackRate !== null) video.playbackRate = playbackRate;
  }, [playbackRate]);

  // Auto mode plays continuously at the stretched/compressed rate — no
  // per-word reseeking, which was causing a visible stutter/jump on every
  // word tick. Manual mode is the only thing that ever scrubs the video.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration === null) return;

    if (mode === "manual") {
      video.pause();
    } else if (revealed && !fading && video.paused) {
      video.play().catch(() => undefined);
    }
  }, [mode, duration, revealed, fading]);

  // Manual navigation scrubs the video to the position corresponding to the
  // word the reader just jumped to.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration === null || mode !== "manual") return;

    const target = wordFraction * duration;
    if (Math.abs(video.currentTime - target) > RESEEK_THRESHOLD_S) {
      video.currentTime = target;
    }
  }, [wordFraction, mode, duration]);

  return (
    <div className={styles.stack}>
      {relayUrl && (
        <video
          ref={videoRef}
          className={`${styles.relay} ${revealed ? styles.revealed : ""} ${
            fading ? styles.faded : ""
          }`}
          src={relayUrl}
          preload="auto"
          muted
          playsInline
        />
      )}
      <div className={styles.scrim} />
    </div>
  );
}
