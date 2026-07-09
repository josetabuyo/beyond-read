"use client";

import { useEffect, useRef, useState } from "react";
import {
  ENDING_HOLD_MS,
  ENDING_SLOWDOWN_FACTOR,
  TEXT_START_DELAY_MS,
  imageRevealDurationMs,
} from "@/lib/timing";
import styles from "./RelayVideoBackground.module.css";

const READY_TIMEOUT_MS = 6000;
const MIN_PLAYBACK_RATE = 0.4;
const MAX_PLAYBACK_RATE = 2.5;
const RESEEK_THRESHOLD_S = 0.12;
// How long the video visually dips (blurs) to mask a manual-navigation jump cut.
const SEEK_VEIL_MS = 220;
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
  endingSlowFactor = 1,
  startingSlowFactor = 1,
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
  /** Divides the playback rate — 1 at regular pace, jumps to ENDING_SLOWDOWN_FACTOR the instant the last word is reached. */
  endingSlowFactor?: number;
  /** Divides the playback rate — STARTUP_SLOWDOWN_FACTOR right after reveal, easing to 1 as the reading begins. */
  startingSlowFactor?: number;
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const seekVeilTimeoutRef = useRef<number | null>(null);

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

  // Stretch or compress the relay video so its full length spans this
  // reading's duration — but reserve a tail of footage for the closing slow
  // motion, and account for the video already playing for TEXT_START_DELAY_MS
  // before the word-by-word timeline even starts. Without both, the
  // regular-pace rate would consume the entire video by the time the last
  // word arrives, leaving nothing to play during the hold: it would just
  // freeze on the final frame instead of easing into slow motion.
  useEffect(() => {
    if (duration === null || totalReadingMs <= 0) return;
    const effectiveTotalMs =
      TEXT_START_DELAY_MS + totalReadingMs + ENDING_HOLD_MS / ENDING_SLOWDOWN_FACTOR;
    const rate = (duration * 1000) / effectiveTotalMs;
    setPlaybackRate(Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate)));
  }, [duration, totalReadingMs]);

  // endingSlowFactor is 1 at every regular pace and jumps straight to
  // ENDING_SLOWDOWN_FACTOR the instant the last word is reached — a hard cut
  // into slow motion for the closing tail, never a gradual ramp.
  // startingSlowFactor is the opening mirror: it eases from
  // STARTUP_SLOWDOWN_FACTOR down to 1 as the reading begins, a gradual ramp
  // rather than a hard cut. Neither ever seeks, so neither reintroduces the stutter.
  useEffect(() => {
    const video = videoRef.current;
    if (video && playbackRate !== null) {
      video.playbackRate = playbackRate / endingSlowFactor / startingSlowFactor;
    }
  }, [playbackRate, endingSlowFactor, startingSlowFactor]);

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
  // word the reader just jumped to. That's a hard cut in the footage, which
  // reads as a glitch against the piece's otherwise smooth pacing — so the
  // jump itself happens hidden behind a brief blur veil, which then lifts to
  // reveal the new frame, instead of a visible splice.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration === null || mode !== "manual") return;

    const target = wordFraction * duration;
    if (Math.abs(video.currentTime - target) <= RESEEK_THRESHOLD_S) return;

    if (seekVeilTimeoutRef.current) window.clearTimeout(seekVeilTimeoutRef.current);
    setSeeking(true);

    seekVeilTimeoutRef.current = window.setTimeout(() => {
      video.currentTime = target;
      seekVeilTimeoutRef.current = window.setTimeout(() => setSeeking(false), SEEK_VEIL_MS);
    }, SEEK_VEIL_MS);

    return () => {
      if (seekVeilTimeoutRef.current) window.clearTimeout(seekVeilTimeoutRef.current);
    };
  }, [wordFraction, mode, duration]);

  // Stretches the opacity fade-in across up to a third of the reading, so the
  // face emerges gradually instead of pulling focus from the words early.
  // Only applied while revealing — once fading (the ending), the CSS
  // `.faded` rule's own transition takes over, so this inline override must
  // step aside rather than clobber it.
  const revealStyle = fading
    ? undefined
    : { transitionDuration: `${imageRevealDurationMs(totalReadingMs)}ms, 220ms` };

  return (
    <div className={styles.stack}>
      {relayUrl && (
        <video
          ref={videoRef}
          className={`${styles.relay} ${revealed ? styles.revealed : ""} ${
            fading ? styles.faded : ""
          } ${seeking ? styles.seeking : ""}`}
          style={revealStyle}
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
