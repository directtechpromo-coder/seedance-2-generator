import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

const FAL_API_KEY = process.env.SEEDANCE_V2_API_KEY;
fal.config({ credentials: FAL_API_KEY });

export const maxDuration = 60;

// NEW: Handles video file uploads for the Reference Video feature. Accepts a
// multipart/form-data POST with a "file" field, uploads it to FAL's storage,
// and returns a public URL that can be used as video_url in generation requests.
//
// NOTE: Vercel serverless functions have a request body size limit (~4.5MB by
// default). Large/long video files may fail to upload here — if that becomes
// a problem, a direct-to-FAL-CDN upload flow (bypassing our own server) would
// be needed instead.
export async function POST(req) {
  try {
    if (!FAL_API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const url = await fal.storage.upload(file);

    if (!url) {
      return NextResponse.json({ error: "Upload failed — no URL returned" }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[UPLOAD_VIDEO_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
