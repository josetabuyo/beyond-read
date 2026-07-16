import { NextRequest, NextResponse } from "next/server";
import { isValidPoemId } from "@/lib/poems";
import { sweep, claimRelayVideo } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const poemId = body?.poemId;

  if (typeof poemId !== "string" || !isValidPoemId(poemId)) {
    return NextResponse.json({ error: "invalid poemId" }, { status: 400 });
  }

  await sweep();
  const claimed = await claimRelayVideo(poemId);

  return NextResponse.json({
    relayVideoUrl: claimed ? claimed.url : null,
  });
}
