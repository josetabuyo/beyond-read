import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/meta";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getRecord(id);
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const storage = getStorage();
  const totalSize = await storage.size(id);

  const rangeHeader = request.headers.get("range");
  let start = 0;
  let end = totalSize - 1;

  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (match) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : totalSize - 1;
    }
  }

  const { stream, size } = await storage.getStream(id, { start, end });

  const headers = new Headers({
    "Content-Type": "video/webm",
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
  });

  if (rangeHeader) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    return new NextResponse(stream, { status: 206, headers });
  }

  return new NextResponse(stream, { status: 200, headers });
}
