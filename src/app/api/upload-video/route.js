import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { fal } from "@fal-ai/client";

const FAL_API_KEY = process.env.SEEDANCE_V2_API_KEY;
fal.config({ credentials: FAL_API_KEY });

export const maxDuration = 60;

// Handles video/image file uploads for the Reference Video and Product/Character
// Reference Images features. Accepts a multipart/form-data POST with a "file"
// field, uploads it to FAL's storage, and returns a public URL.
export async function POST(req) {
  try {
    // NEW: require a signed-in user before allowing uploads.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to upload files." }, { status: 401 });
    }

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
