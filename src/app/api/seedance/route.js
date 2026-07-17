import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/services/ai";

export const maxDuration = 300; // seconds — needed for Clip A/B chaining (Veo clip A can take 2-3 min on FAL before Part B can be submitted)

// NEW: creates a Creation row (or one per clip, for split/multi-clip results) so
// generation history and credit deduction can be tracked. Best-effort — logging
// failures here should never break the actual generation response.
async function recordCreations({ result, userId, prompt, aspect_ratio, resolution, estimatedCredits }) {
  try {
    if (result.clips && Array.isArray(result.clips)) {
      const perClipCredits = Math.max(1, Math.ceil(estimatedCredits / result.clips.length));
      await prisma.creation.createMany({
        data: result.clips.map((clip) => ({
          requestId: clip.request_id,
          userId,
          prompt,
          aspectRatio: aspect_ratio,
          resolution,
          duration: typeof clip.duration === "number" ? Math.round(clip.duration) : null,
          status: "processing",
          creditsCost: perClipCredits,
        })),
      });
    } else if (result.request_id) {
      await prisma.creation.create({
        data: {
          requestId: result.request_id,
          userId,
          prompt,
          aspectRatio: aspect_ratio,
          resolution,
          duration: typeof result.metadata?.duration === "number" ? Math.round(result.metadata.duration) : null,
          status: "processing",
          creditsCost: estimatedCredits,
        },
      });
    }
  } catch (e) {
    console.error("[RECORD_CREATION]", e);
  }
}

export async function POST(req) {
  try {
    // Real authentication — every generation now requires a signed-in user.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to generate videos." }, { status: 401 });
    }
    const userId = session.user.id;
    const isAdmin = session.user.isAdmin;

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
      image_urls, // reference image URLs for Product/Character Reference mode (Multi-Scene ads)
    } = body;

    // NEW: check the user has enough credits BEFORE calling FAL, so we never
    // charge for (or waste an API call on) a generation they can't afford.
    // Admins bypass this check entirely (session.user.isAdmin is set from auth.js).
    const estimatedCredits = AIService.estimateCredits({ mode, generate_audio, resolution, duration });
    if (!isAdmin) {
      const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!dbUser || dbUser.credits < estimatedCredits) {
        return NextResponse.json(
          { error: `Insufficient credits. This needs about ${estimatedCredits} credits, you have ${dbUser?.credits ?? 0}.` },
          { status: 402 }
        );
      }
    }

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
      const result = await AIService.generateReferenceEdit(userId, {
        prompt,
        video_url,
        image_urls,
        resolution,
        aspect_ratio,
        duration,
        generate_audio,
      });
      await recordCreations({ result, userId, prompt, aspect_ratio, resolution, estimatedCredits });
      return NextResponse.json({ ...result, metadata: { ...result.metadata, prompt } });
    }

    if (!prompt && mode === "text-to-video") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const result = await AIService.generate(userId, {
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
    await recordCreations({ result, userId, prompt, aspect_ratio, resolution, estimatedCredits });
    return NextResponse.json({ ...result, metadata: { ...result.metadata, prompt, aspect_ratio, resolution } });
  } catch (error) {
    console.error("[AI_SEEDANCE]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
