import { Redis } from "@upstash/redis";
import { getStorage } from "../storage";
import { getMaxPerPoem, MAX_INITIAL_VIEWS, DELETE_GRACE_MS, MAX_AGE_MS } from "./types";
import type { ClaimedVideo, MetaStore, VideoRecord } from "./types";

// Lazy — a bare `Redis.fromEnv()` at module scope throws when the env vars
// aren't set, which would crash every import of this module (including at
// build time) even when the JSON store ends up being the one actually used.
let client: Redis | null = null;
function redis(): Redis {
  if (!client) client = Redis.fromEnv();
  return client;
}

function hashKey(id: string): string {
  return `video:${id}`;
}

function activeKey(poemId: string): string {
  return `poem:${poemId}:active`;
}

const ALL_KEY = "videos:all";
const PENDING_KEY = "videos:pending";

/**
 * Claims the oldest id off the poem's active ZSET and decrements its view
 * count — atomically, so two concurrent claims (different serverless
 * instances) can never both walk away thinking they got the last view.
 * KEYS: [activeKey, PENDING_KEY]. ARGV: [now].
 * Returns {id, url} or false if the poem has no active video.
 */
const CLAIM_SCRIPT = `
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0)
if #oldest == 0 then
  return false
end
local id = oldest[1]
local hkey = 'video:' .. id
local remaining = tonumber(redis.call('HINCRBY', hkey, 'remainingViews', -1))
local url = redis.call('HGET', hkey, 'url')
if remaining <= 0 then
  redis.call('ZREM', KEYS[1], id)
  redis.call('HSET', hkey, 'claimedForDeletion', ARGV[1])
  redis.call('ZADD', KEYS[2], ARGV[1], id)
end
return {id, url}
`;

/**
 * Evicts the oldest active records past the per-poem cap, then inserts the
 * new one — atomically, so two concurrent uploads for the same poem can't
 * each observe a stale count and leave the poem over its cap.
 * KEYS: [activeKey, ALL_KEY].
 * ARGV: [maxPerPoem, id, poemId, filename, url, now, maxInitialViews].
 * Returns {initialViews, evictedIds}.
 */
const INSERT_SCRIPT = `
local activeKey = KEYS[1]
local allKey = KEYS[2]
local maxPerPoem = tonumber(ARGV[1])
local id = ARGV[2]
local poemId = ARGV[3]
local filename = ARGV[4]
local url = ARGV[5]
local now = ARGV[6]
local maxInitialViews = tonumber(ARGV[7])

local evicted = {}
local n = redis.call('ZCARD', activeKey)
while n >= maxPerPoem do
  local oldest = redis.call('ZRANGE', activeKey, 0, 0)
  if #oldest == 0 then break end
  local oldestId = oldest[1]
  redis.call('ZREM', activeKey, oldestId)
  redis.call('ZREM', allKey, oldestId)
  redis.call('DEL', 'video:' .. oldestId)
  table.insert(evicted, oldestId)
  n = n - 1
end

local initialViews = maxInitialViews + 1 - n
if initialViews > 3 then initialViews = 3 end
if initialViews < 1 then initialViews = 1 end

local hkey = 'video:' .. id
redis.call('HSET', hkey, 'poemId', poemId, 'filename', filename, 'url', url, 'remainingViews', initialViews, 'createdAt', now)
redis.call('ZADD', activeKey, now, id)
redis.call('ZADD', allKey, now, id)

return {initialViews, evicted}
`;

class RedisMetaStore implements MetaStore {
  async sweep(now: number): Promise<void> {
    const storage = getStorage();
    const graceThreshold = now - DELETE_GRACE_MS;
    const ageThreshold = now - MAX_AGE_MS;

    const [pendingIds, staleIds] = await Promise.all([
      redis().zrange<string[]>(PENDING_KEY, "-inf", graceThreshold, { byScore: true }),
      redis().zrange<string[]>(ALL_KEY, "-inf", ageThreshold, { byScore: true }),
    ]);

    const ids = Array.from(new Set([...pendingIds, ...staleIds]));

    for (const id of ids) {
      const record = await this.getRecord(id);
      await storage.del(id);

      const pipeline = redis().pipeline();
      pipeline.del(hashKey(id));
      pipeline.zrem(ALL_KEY, id);
      pipeline.zrem(PENDING_KEY, id);
      if (record) pipeline.zrem(activeKey(record.poemId), id);
      await pipeline.exec();
    }
  }

  async claimRelayVideo(poemId: string, now: number): Promise<ClaimedVideo | null> {
    const result = await redis().eval(
      CLAIM_SCRIPT,
      [activeKey(poemId), PENDING_KEY],
      [String(now)],
    );
    if (!result) return null;
    const [id, url] = result as [string, string];
    return { id, url };
  }

  async insertRecording(
    poemId: string,
    id: string,
    filename: string,
    url: string,
    now: number,
  ): Promise<VideoRecord> {
    const storage = getStorage();
    const maxPerPoem = getMaxPerPoem();

    const result = await redis().eval(
      INSERT_SCRIPT,
      [activeKey(poemId), ALL_KEY],
      [String(maxPerPoem), id, poemId, filename, url, String(now), String(MAX_INITIAL_VIEWS)],
    );
    const [initialViews, evictedIds] = result as [number, string[]];

    for (const evictedId of evictedIds) {
      await storage.del(evictedId);
    }

    return { id, poemId, filename, url, remainingViews: initialViews, createdAt: now };
  }

  async getRecord(id: string): Promise<VideoRecord | undefined> {
    const data = await redis().hgetall<Record<string, string | number>>(hashKey(id));
    if (!data || Object.keys(data).length === 0) return undefined;

    return {
      id,
      poemId: String(data.poemId),
      filename: String(data.filename),
      url: String(data.url),
      remainingViews: Number(data.remainingViews),
      createdAt: Number(data.createdAt),
      claimedForDeletion:
        data.claimedForDeletion !== undefined ? Number(data.claimedForDeletion) : undefined,
    };
  }
}

export const redisMetaStore: MetaStore = new RedisMetaStore();
