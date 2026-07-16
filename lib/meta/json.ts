import fsp from "node:fs/promises";
import path from "node:path";
import { getStorage } from "../storage";
import { getDataDir } from "../dataDir";
import { getMaxPerPoem, MAX_INITIAL_VIEWS, DELETE_GRACE_MS, MAX_AGE_MS } from "./types";
import type { ClaimedVideo, MetaStore, VideoRecord } from "./types";

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

/**
 * Serializes every mutation through an in-memory queue — safe only because
 * this store assumes a single process. That assumption is exactly why this
 * backend is for local dev only: it doesn't hold across the multiple
 * concurrent serverless instances a real deployment runs (see ./redis.ts).
 */
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

class JsonMetaStore implements MetaStore {
  async sweep(now: number): Promise<void> {
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

    // Orphan sweep: stored files with no metadata record (crash orphans).
    // Only backends that can enumerate cheaply implement listIds() — blob
    // storage skips this rather than paying for a list() call every sweep.
    if (storage.listIds) {
      const ids = await storage.listIds();
      if (ids.length > 0) {
        const meta = await readMeta();
        const knownIds = new Set(meta.videos.map((v) => v.id));
        for (const id of ids) {
          if (!knownIds.has(id)) {
            await storage.del(id);
          }
        }
      }
    }
  }

  async claimRelayVideo(poemId: string, now: number): Promise<ClaimedVideo | null> {
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
      return { id: chosen.id, url: chosen.url };
    });
  }

  async insertRecording(
    poemId: string,
    id: string,
    filename: string,
    url: string,
    now: number,
  ): Promise<VideoRecord> {
    const storage = getStorage();

    return mutateMeta(async (meta) => {
      const active = meta.videos
        .filter((v) => v.poemId === poemId && v.remainingViews > 0)
        .sort((a, b) => a.createdAt - b.createdAt);

      const maxPerPoem = getMaxPerPoem();
      let n = active.length;
      while (n >= maxPerPoem) {
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
        url,
        remainingViews: initialViews,
        createdAt: now,
      };
      meta.videos.push(record);
      return record;
    });
  }

  async getRecord(id: string): Promise<VideoRecord | undefined> {
    const meta = await readMeta();
    return meta.videos.find((v) => v.id === id);
  }
}

export const jsonMetaStore: MetaStore = new JsonMetaStore();
