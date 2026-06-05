import { NextResponse } from "next/server";
import { AIService } from "@/lib/services/ai";

export async function POST(req) {
  try {
    const body = await req.json();
    const { mode, prompt, aspect_ratio, resolution, duration, quality, model, images_list } = body;

    if (!prompt && mode === 'text-to-video') {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const fakeUserId = "guest-user-123";
    let result;
    if (mode === "reference-to-video") {
      result = await AIService.generate(fakeUserId, { mode, prompt, images_list, aspect_ratio, resolution, duration, quality, model });
    } else {
      result = await AIService.generate(fakeUserId, { mode, prompt, aspect_ratio, resolution, duration, quality, model, images_list });
    }

    return NextResponse.json({ ...result, metadata: { prompt, aspect_ratio, resolution } });
  } catch (error) {
    console.error("[AI_SEEDANCE]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
