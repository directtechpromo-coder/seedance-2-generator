import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AIService } from "@/lib/services/ai";

export const maxDuration = 60;

export async function POST(req) {
  try {
    // NEW: require a signed-in user before allowing transcription.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to use this feature." }, { status: 401 });
    }

    const { video_url } = await req.json();
    if (!video_url) {
      return NextResponse.json({ error: "video_url is required" }, { status: 400 });
    }
    const data = await AIService.transcribeAudio(video_url);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[TRANSCRIBE]", error);
    return NextResponse.json({ error: error.message || "Transcription failed" }, { status: 500 });
  }
}
