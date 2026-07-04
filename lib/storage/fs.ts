import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { VideoStorage, StreamRange, VideoStreamResult } from "./index";
import { getDataDir } from "../dataDir";

export function videosDir(): string {
  return path.join(getDataDir(), "videos");
}

function filePath(id: string): string {
  return path.join(videosDir(), `${id}.webm`);
}

async function ensureDir(): Promise<void> {
  await fsp.mkdir(videosDir(), { recursive: true });
}

class FsVideoStorage implements VideoStorage {
  async put(id: string, data: ReadableStream | Buffer): Promise<void> {
    await ensureDir();
    const dest = filePath(id);

    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(dest, data);
      return;
    }

    const nodeStream = Readable.fromWeb(data as NodeWebReadableStream<Uint8Array>);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      nodeStream.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
      nodeStream.on("error", reject);
    });
  }

  async getStream(id: string, range?: StreamRange): Promise<VideoStreamResult> {
    const target = filePath(id);
    const stat = await fsp.stat(target);
    const size = stat.size;
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;

    const nodeStream = fs.createReadStream(target, { start, end });
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    return { stream: webStream, size, start, end };
  }

  async del(id: string): Promise<void> {
    try {
      await fsp.unlink(filePath(id));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async size(id: string): Promise<number> {
    const stat = await fsp.stat(filePath(id));
    return stat.size;
  }
}

export const fsStorage: VideoStorage = new FsVideoStorage();
