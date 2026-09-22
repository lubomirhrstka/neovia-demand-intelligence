import { NextResponse } from "next/server";

const pixel = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  return new NextResponse(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
