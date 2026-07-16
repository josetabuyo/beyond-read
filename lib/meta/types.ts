export const MAX_INITIAL_VIEWS = 3;
export const DELETE_GRACE_MS = 10 * 60_000;
export const MAX_AGE_MS = 24 * 60 * 60_000;

/** Overridable via env: how many relay videos to keep in flight per poem. */
export function getMaxPerPoem(): number {
  return process.env.BEYOND_READ_MAX_PER_POEM
    ? Number(process.env.BEYOND_READ_MAX_PER_POEM)
    : 1;
}

export interface VideoRecord {
  id: string;
  poemId: string;
  filename: string;
  /** Where the video can be played back from directly (see storage.PutResult). */
  url: string;
  remainingViews: number;
  createdAt: number;
  claimedForDeletion?: number;
}

export interface ClaimedVideo {
  id: string;
  url: string;
}

/**
 * The persistence backend for video records — FIFO claims, per-poem caps,
 * and grace-period/max-age eviction. Two implementations: a JSON file for
 * local dev (single process, fine with an in-memory queue for atomicity),
 * and Upstash Redis for production (multiple serverless instances, needs
 * real atomic operations instead of a process-local mutex).
 */
export interface MetaStore {
  /** Deletes blobs+records past their deletion grace or max age. */
  sweep(now: number): Promise<void>;
  /**
   * Claims the oldest active relay video for a poem (FIFO), decrementing its
   * view count at claim time so concurrent claims can never both consume the
   * last view. Returns null when no relay video exists yet (first-reader case).
   */
  claimRelayVideo(poemId: string, now: number): Promise<ClaimedVideo | null>;
  /**
   * Registers a recording whose blob has ALREADY been written to storage
   * (caller writes the blob first, under `id`, then calls this — so a crash
   * between the two leaves only an orphan file, never a dangling record).
   * Evicts the oldest active record for the poem if the per-poem cap is
   * exceeded, and computes this new video's initial view budget from
   * current demand (the self-balancing lever: busier poems grant fewer
   * replays per video, keeping storage flat).
   */
  insertRecording(
    poemId: string,
    id: string,
    filename: string,
    url: string,
    now: number,
  ): Promise<VideoRecord>;
  getRecord(id: string): Promise<VideoRecord | undefined>;
}
