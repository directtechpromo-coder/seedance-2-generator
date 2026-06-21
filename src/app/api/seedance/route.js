import { NextResponse } from "next/server";
import { AIService } from "@/lib/services/ai";

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      mode,
      prompt,
      negative_prompt, // NEW: helps keep style consistent (e.g. prevent cartoon -> realistic drift)
      aspect_ratio,
      resolution,
      duration,
      quality,
      images_list,
      generate_audio, // NEW: true -> Veo 3.1 (audio+lipsync), false/undefined -> Wan 2.2 (silent)
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
    });

    // result is either:
    //   { request_id, metadata }                 -> single clip
    //   { clips: [{request_id,...}, {...}], metadata } -> auto-split (Veo > 8s)
    return NextResponse.json({ ...result, metadata: { ...result.metadata, prompt, aspect_ratio, resolution } });
  } catch (error) {
    console.error("[AI_SEEDANCE]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}

