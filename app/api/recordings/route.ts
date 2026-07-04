import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidPoemId } from "@/lib/poems";
import { sweep, insertRecording } from "@/lib/meta";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const poemId = request.headers.get("x-poem-id");
  if (!poemId || !isValidPoemId(poemId)) {
    return NextResponse.json({ error: "invalid poemId" }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "recording too large" }, { status: 413 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "missing body" }, { status: 400 });
  }

  await sweep();

  const id = crypto.randomUUID();
  const storage = getStorage();

  await storage.put(id, request.body as ReadableStream);

  const size = await storage.size(id);
  if (size > MAX_BYTES) {
    await storage.del(id);
    return NextResponse.json({ error: "recording too large" }, { status: 413 });
  }

  await insertRecording(poemId, id, `${id}.webm`);

  return NextResponse.json({ id }, { status: 201 });
}
