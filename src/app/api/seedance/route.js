import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/services/ai";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Please sign in to generate videos." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const admin = isAdminEmail(session.user.email);

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
    } = body;

    if (!prompt && mode === "text-to-video") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const creditCost = Math.max(5, Math.ceil(Number(duration) || 5));

    if (!admin) {
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!dbUser || dbUser.credits < creditCost) {
        return NextResponse.json(
          { error: "Not enough credits. Please top up to keep generating." },
          { status: 402 }
        );
      }
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
    });

    if (!admin) {
      await prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: creditCost } },
      });
    }

    const requestIds = result.clips ? result.clips.map((c) => c.request_id) : [result.request_id];

    await Promise.all(
      requestIds.map((reqId) =>
        prisma.creation
          .create({
            data: {
              userId,
              prompt,
              requestId: reqId,
              status: "processing",
              aspectRatio: aspect_ratio,
              resolution,
              duration: Number(duration) || 5,
            },
          })
          .catch((e) => console.error("[CREATE_CREATION]", e))
      )
    );

    return NextResponse.json({
      ...result,
      metadata: { ...result.metadata, prompt, aspect_ratio, resolution },
    });
  } catch (error) {
    console.error("[AI_SEEDANCE]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
