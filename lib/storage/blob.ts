import { put, del as deleteBlob, head } from "@vercel/blob";
import type { VideoStorage, StreamRange, VideoStreamResult, PutResult } from "./index";

function pathnameFor(id: string): string {
  return `${id}.webm`;
}

/**
 * Public blobs so relay video is served straight from the CDN instead of
 * proxied through a Function — cheaper (Blob Data Transfer vs Fast Data
 * Transfer) and it's the same obscurity model /api/videos/[id] already had:
 * readable only by anyone holding the random id.
 */
class BlobVideoStorage implements VideoStorage {
  async put(id: string, data: ReadableStream | Buffer): Promise<PutResult> {
    const blob = await put(pathnameFor(id), data, {
      access: "public",
      contentType: "video/webm",
    });
    // put()'s own result doesn't reliably carry size for streamed uploads —
    // head() (a cheap Simple Operation) gets the definitive figure.
    const meta = await head(blob.url);
    return { url: blob.url, size: meta.size };
  }

  async getStream(id: string, range?: StreamRange): Promise<VideoStreamResult> {
    const meta = await head(pathnameFor(id));
    const size = meta.size;
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;

    const response = await fetch(meta.url, { headers: { Range: `bytes=${start}-${end}` } });
    if (!response.body) throw new Error(`blob ${id} returned no body`);

    return { stream: response.body, size, start, end };
  }

  async del(id: string): Promise<void> {
    await deleteBlob(pathnameFor(id));
  }

  async size(id: string): Promise<number> {
    const meta = await head(pathnameFor(id));
    return meta.size;
  }
}

export const blobStorage: VideoStorage = new BlobVideoStorage();
