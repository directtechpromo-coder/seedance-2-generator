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
      video_url, // reference video URL for Reference Video Editing mode
      image_urls, // NEW: reference image URLs for Product/Character Reference mode (Multi-Scene ads)
    } = body;

    const fakeUserId = "guest-user-123";

    // Reference Generation — used by both Reference Video Editing (video_url) and
    // Product/Character Reference in Multi-Scene mode (image_urls). Uses ByteDance's
    // reference-to-video endpoint instead of the Wan/Veo generate() pipeline.
    if (mode === "reference-edit" || mode === "reference-images") {
      if (!prompt) {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
      }
      if (!video_url && (!image_urls || image_urls.length === 0)) {
        return NextResponse.json({ error: "At least one reference video or image is required" }, { status: 400 });
      }
      const result = await AIService.generateReferenceEdit(fakeUserId, {
        prompt,
        video_url,
        image_urls,
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
