"use client";

import { useCallback, useRef } from "react";

const CANDIDATE_MIME_TYPES = ["video/webm;codecs=vp8,opus", "video/webm"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback((stream: MediaStream) => {
    chunksRef.current = [];
    const mimeType = pickMimeType();

    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
    } catch (err) {
      console.warn("no se pudo iniciar la grabación", err);
      recorderRef.current = null;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { start, stop };
}
