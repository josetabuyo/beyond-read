import { jsonMetaStore } from "./json";
import { redisMetaStore } from "./redis";
import type { ClaimedVideo, MetaStore, VideoRecord } from "./types";

export { getMaxPerPoem, MAX_INITIAL_VIEWS, DELETE_GRACE_MS, MAX_AGE_MS } from "./types";
export type { VideoRecord, ClaimedVideo } from "./types";

/**
 * Upstash Redis when linked, local JSON file otherwise. Checks both env var
 * namings: Vercel's Upstash marketplace integration injects the legacy
 * KV_REST_API_URL/TOKEN pair, not UPSTASH_REDIS_REST_URL/TOKEN — mirrors the
 * same fallback @upstash/redis's own Redis.fromEnv() already does, so the
 * two stay in sync.
 */
function getMetaStore(): MetaStore {
  const hasRedis = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  return hasRedis ? redisMetaStore : jsonMetaStore;
}

export function sweep(now: number = Date.now()): Promise<void> {
  return getMetaStore().sweep(now);
}

export function claimRelayVideo(
  poemId: string,
  now: number = Date.now(),
): Promise<ClaimedVideo | null> {
  return getMetaStore().claimRelayVideo(poemId, now);
}

export function insertRecording(
  poemId: string,
  id: string,
  filename: string,
  url: string,
  now: number = Date.now(),
): Promise<VideoRecord> {
  return getMetaStore().insertRecording(poemId, id, filename, url, now);
}

export function getRecord(id: string): Promise<VideoRecord | undefined> {
  return getMetaStore().getRecord(id);
}
