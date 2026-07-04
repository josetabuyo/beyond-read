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

export interface VideoStorage {
  put(id: string, data: ReadableStream | Buffer): Promise<void>;
  getStream(id: string, range?: StreamRange): Promise<VideoStreamResult>;
  del(id: string): Promise<void>;
  size(id: string): Promise<number>;
}

import { fsStorage } from "./fs";

export function getStorage(): VideoStorage {
  return fsStorage;
}
