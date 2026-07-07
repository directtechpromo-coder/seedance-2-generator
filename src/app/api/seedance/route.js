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
      seed,
      previous_video_url,
      video_url, // NEW: reference video URL for Reference Video Editing mode
    } = body;

    const fakeUserId = "guest-user-123";

    // NEW: Reference Video Editing — separate flow, uses ByteDance's
    // reference-to-video endpoint instead of the Wan/Veo generate() pipeline.
    if (mode === "reference-edit") {
      if (!prompt) {
        return NextResponse.json({ error: "Prompt is required — describe what to change" }, { status: 400 });
      }
      if (!video_url) {
        return NextResponse.json({ error: "Reference video URL is required" }, { status: 400 });
      }
      const result = await AIService.generateReferenceEdit(fakeUserId, {
        prompt,
        video_url,
        resolution,
        aspect_ratio,
        duration,
        generate_audio,
      });
      return NextResponse.json({ ...result, metadata: { ...result.metadata, prompt } });
    }

    if (!prompt && mode === "text-to-video") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
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
