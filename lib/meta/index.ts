import { jsonMetaStore } from "./json";
import { redisMetaStore } from "./redis";
import type { ClaimedVideo, MetaStore, VideoRecord } from "./types";

export { getMaxPerPoem, MAX_INITIAL_VIEWS, DELETE_GRACE_MS, MAX_AGE_MS } from "./types";
export type { VideoRecord, ClaimedVideo } from "./types";

/** Upstash Redis when linked (UPSTASH_REDIS_REST_URL present), local JSON file otherwise. */
function getMetaStore(): MetaStore {
  return process.env.UPSTASH_REDIS_REST_URL ? redisMetaStore : jsonMetaStore;
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
