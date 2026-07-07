import { NextResponse } from "next/server";
import { AIService } from "@/lib/services/ai";

export const maxDuration = 120; // seconds — needed for Clip A/B chaining and scene-to-scene frame chaining

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      mode,
      prompt,
      negative_prompt,
      aspect_ratio,
      resolution,
      duration,
      quality,
      images_list,
      generate_audio,
      seed, // NEW: pass through so multi-scene mode can reuse the same seed across scenes
      previous_video_url, // NEW: pass through so this scene can chain from the previous scene's last frame
    } = body;
    if (!prompt && mode === "text-to-video") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const fakeUserId = "guest-user-123";
    const result = await AIService.generate(fakeUserId, {
      mode,
      prompt,
      negative_prompt,
      images_list,
      aspect_ratio,
      resolution,
      duration,
      quality,
      generate_audio,
      seed,
      previous_video_url,
    });
    return NextResponse.json({ ...result, metadata: { ...result.metadata, prompt, aspect_ratio, resolution } });
  } catch (error) {
    console.error("[AI_SEEDANCE]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
