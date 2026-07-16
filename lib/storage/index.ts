export interface StreamRange {
  start: number;
  end?: number;
}

export interface VideoStreamResult {
  stream: ReadableStream;
  size: number;
  start: number;
  end: number;
}

export interface PutResult {
  /** Where the video can be played back from directly — a public blob URL in production, a proxy route for local fs. */
  url: string;
  size: number;
}

export interface VideoStorage {
  put(id: string, data: ReadableStream | Buffer): Promise<PutResult>;
  getStream(id: string, range?: StreamRange): Promise<VideoStreamResult>;
  del(id: string): Promise<void>;
  size(id: string): Promise<number>;
  /**
   * Enumerates every id currently stored — used only for orphan sweeps.
   * Optional: only implemented by backends that can enumerate cheaply
   * (local fs). Blob storage skips this rather than paying for a list()
   * call on every sweep.
   */
  listIds?(): Promise<string[]>;
}

import { fsStorage } from "./fs";
import { blobStorage } from "./blob";

/** Vercel Blob when a store is linked (BLOB_READ_WRITE_TOKEN present), local filesystem otherwise. */
export function getStorage(): VideoStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? blobStorage : fsStorage;
}
