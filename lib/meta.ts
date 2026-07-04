import fsp from "node:fs/promises";
import path from "node:path";
import { getStorage } from "./storage";
import { videosDir } from "./storage/fs";
import { getDataDir } from "./dataDir";

export const MAX_PER_POEM = 5;
export const MAX_INITIAL_VIEWS = 3;
export const DELETE_GRACE_MS = 10 * 60_000;
export const MAX_AGE_MS = 24 * 60 * 60_000;

export interface VideoRecord {
  id: string;
  poemId: string;
  filename: string;
  remainingViews: number;
  createdAt: number;
  claimedForDeletion?: number;
}

interface Meta {
  videos: VideoRecord[];
}

function metaPath(): string {
  return path.join(getDataDir(), "meta.json");
}

async function readMeta(): Promise<Meta> {
  try {
    const raw = await fsp.readFile(metaPath(), "utf-8");
    return JSON.parse(raw) as Meta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { videos: [] };
    }
    throw err;
  }
}

async function writeMeta(meta: Meta): Promise<void> {
  await fsp.mkdir(path.dirname(metaPath()), { recursive: true });
  await fsp.writeFile(metaPath(), JSON.stringify(meta, null, 2), "utf-8");
}

let queue: Promise<unknown> = Promise.resolve();

function mutateMeta<T>(fn: (meta: Meta) => T | Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const meta = await readMeta();
    const value = await fn(meta);
    await writeMeta(meta);
    return value;
  });
  // Swallow so a failed mutation doesn't wedge the queue for subsequent callers.
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Deletes blobs+records past their deletion grace or max age, and unlinks
 * any blob file with no matching metadata record (crash orphans).
 */
export async function sweep(now: number = Date.now()): Promise<void> {
  const storage = getStorage();

  await mutateMeta(async (meta) => {
    const survivors: VideoRecord[] = [];
    for (const record of meta.videos) {
      const pastGrace =
        record.claimedForDeletion !== undefined &&
        now - record.claimedForDeletion > DELETE_GRACE_MS;
      const tooOld = now - record.createdAt > MAX_AGE_MS;

      if (pastGrace || tooOld) {
        await storage.del(record.id);
      } else {
        survivors.push(record);
      }
    }
    meta.videos = survivors;
  });

  // Orphan sweep: blob files with no metadata record.
  let files: string[] = [];
  try {
    files = await fsp.readdir(videosDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (files.length > 0) {
    const meta = await readMeta();
    const knownIds = new Set(meta.videos.map((v) => v.id));
    for (const file of files) {
      const id = file.replace(/\.webm$/, "");
      if (!knownIds.has(id)) {
        await storage.del(id);
      }
    }
  }
}

/**
 * Claims the oldest active relay video for a poem (FIFO), decrementing its
 * view count at claim time so concurrent claims can never both consume the
 * last view. Returns null when no relay video exists yet (first-reader case).
 */
export async function claimRelayVideo(
  poemId: string,
  now: number = Date.now(),
): Promise<string | null> {
  return mutateMeta((meta) => {
    const candidates = meta.videos
      .filter((v) => v.poemId === poemId && v.remainingViews > 0)
      .sort((a, b) => a.createdAt - b.createdAt);

    const chosen = candidates[0];
    if (!chosen) return null;

    chosen.remainingViews -= 1;
    if (chosen.remainingViews <= 0) {
      chosen.claimedForDeletion = now;
    }
    return chosen.id;
  });
}

/**
 * Registers a freshly uploaded recording, evicting the oldest active record
 * for the poem if the per-poem cap is exceeded, and computing this new
 * video's initial view budget from current demand (the self-balancing lever:
 * busier poems grant fewer replays per video, keeping storage flat).
 */
/**
 * Registers a recording whose blob has ALREADY been written to storage
 * (caller writes the blob first, under `id`, then calls this — so a crash
 * between the two leaves only an orphan file, never a dangling record).
 */
export async function insertRecording(
  poemId: string,
  id: string,
  filename: string,
  now: number = Date.now(),
): Promise<VideoRecord> {
  const storage = getStorage();

  return mutateMeta(async (meta) => {
    const active = meta.videos
      .filter((v) => v.poemId === poemId && v.remainingViews > 0)
      .sort((a, b) => a.createdAt - b.createdAt);

    let n = active.length;
    while (n >= MAX_PER_POEM) {
      const oldest = active.shift();
      if (!oldest) break;
      await storage.del(oldest.id);
      meta.videos = meta.videos.filter((v) => v.id !== oldest.id);
      n = active.length;
    }

    const initialViews = Math.min(3, Math.max(1, MAX_INITIAL_VIEWS + 1 - n));

    const record: VideoRecord = {
      id,
      poemId,
      filename,
      remainingViews: initialViews,
      createdAt: now,
    };
    meta.videos.push(record);
    return record;
  });
}

export async function getRecord(id: string): Promise<VideoRecord | undefined> {
  const meta = await readMeta();
  return meta.videos.find((v) => v.id === id);
}
