import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sweep,
  claimRelayVideo,
  insertRecording,
  getRecord,
  MAX_PER_POEM,
  DELETE_GRACE_MS,
  MAX_AGE_MS,
} from "./meta";
import { getStorage } from "./storage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "beyond-read-test-"));
  process.env.BEYOND_READ_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.BEYOND_READ_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function upload(poemId: string, now: number) {
  const storage = getStorage();
  const id = crypto.randomUUID();
  await storage.put(id, Buffer.from("fake webm bytes"));
  return insertRecording(poemId, id, `${id}.webm`, now);
}

describe("claimRelayVideo", () => {
  it("returns null when no video exists for the poem (first reader)", async () => {
    const result = await claimRelayVideo("poem-a");
    expect(result).toBeNull();
  });

  it("claims the oldest video first (FIFO)", async () => {
    const first = await upload("poem-a", 1000);
    await upload("poem-a", 2000);

    const claimed = await claimRelayVideo("poem-a", 3000);
    expect(claimed).toBe(first.id);
  });

  it("decrements remainingViews at claim time, not stream time", async () => {
    const rec = await upload("poem-a", 1000);
    expect(rec.remainingViews).toBe(3);

    await claimRelayVideo("poem-a", 2000);
    const after = await getRecord(rec.id);
    expect(after?.remainingViews).toBe(2);
  });

  it("marks a video for deletion once its views are exhausted, but keeps the blob", async () => {
    const rec = await upload("solo", 1000);
    expect(rec.remainingViews).toBe(3);

    await claimRelayVideo("solo", 2000);
    await claimRelayVideo("solo", 3000);
    const claimedId = await claimRelayVideo("solo", 4000);
    expect(claimedId).toBe(rec.id);

    const record = await getRecord(rec.id);
    expect(record?.remainingViews).toBe(0);
    expect(record?.claimedForDeletion).toBe(4000);

    // Blob must still exist immediately after being claimed to zero (grace period).
    const storage = getStorage();
    await expect(storage.size(rec.id)).resolves.toBeGreaterThan(0);
  });

  it("never returns a video with zero remaining views", async () => {
    const rec = await upload("poem-b", 1000);
    // Exhaust it manually via repeated claims (initial views = 3).
    await claimRelayVideo("poem-b", 2000);
    await claimRelayVideo("poem-b", 2000);
    await claimRelayVideo("poem-b", 2000);

    const result = await claimRelayVideo("poem-b", 2000);
    expect(result).toBeNull();
    void rec;
  });
});

describe("insertRecording eviction", () => {
  it("computes initialViews = clamp(MAX_INITIAL_VIEWS + 1 - n, 1, 3)", async () => {
    const first = await upload("poem-c", 1000);
    expect(first.remainingViews).toBe(3); // n=0 -> clamp(4,1,3)=3

    const second = await upload("poem-c", 2000);
    expect(second.remainingViews).toBe(3); // n=1 -> clamp(3,1,3)=3

    const third = await upload("poem-c", 3000);
    expect(third.remainingViews).toBe(2); // n=2 -> clamp(2,1,3)=2

    const fourth = await upload("poem-c", 4000);
    expect(fourth.remainingViews).toBe(1); // n=3 -> clamp(1,1,3)=1
  });

  it("evicts the oldest active record once the per-poem cap is exceeded", async () => {
    const uploads = [];
    for (let i = 0; i < MAX_PER_POEM; i++) {
      uploads.push(await upload("poem-d", (i + 1) * 1000));
    }
    const oldest = uploads[0];

    // One more upload should push us over the cap and evict the oldest.
    await upload("poem-d", 9000);

    const survivorOldest = await getRecord(oldest.id);
    expect(survivorOldest).toBeUndefined();

    const storage = getStorage();
    await expect(storage.size(oldest.id)).rejects.toBeTruthy();
  });
});

describe("sweep", () => {
  it("deletes records past their deletion grace period", async () => {
    const rec = await upload("poem-e", 1000);
    await claimRelayVideo("poem-e", 2000); // remainingViews 3 -> 2, no deletion yet
    await claimRelayVideo("poem-e", 2000); // -> 1
    await claimRelayVideo("poem-e", 2000); // -> 0, claimedForDeletion = 2000

    await sweep(2000 + DELETE_GRACE_MS + 1);

    const after = await getRecord(rec.id);
    expect(after).toBeUndefined();
    const storage = getStorage();
    await expect(storage.size(rec.id)).rejects.toBeTruthy();
  });

  it("deletes records past max age even if views remain", async () => {
    const rec = await upload("poem-f", 1000);
    await sweep(1000 + MAX_AGE_MS + 1);

    const after = await getRecord(rec.id);
    expect(after).toBeUndefined();
  });

  it("unlinks orphan blob files with no metadata record", async () => {
    const storage = getStorage();
    const orphanId = crypto.randomUUID();
    await storage.put(orphanId, Buffer.from("orphan"));

    await sweep(1000);

    await expect(storage.size(orphanId)).rejects.toBeTruthy();
  });
});
