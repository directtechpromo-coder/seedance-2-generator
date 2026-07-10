import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyFalError } from "@/lib/falErrors";

// NEW: marks a Creation as completed AND deducts credits from the user, in a
// single transaction. Guards against double-charging using the creditsCharged
// flag, in case check-status is called again after completion (e.g. a stray
// poll request racing with the frontend clearing its interval).
async function markCompletedAndCharge(requestId, videoUrl) {
  try {
    const creation = await prisma.creation.findUnique({ where: { requestId } });
    if (!creation) {
      console.error(`[MARK_COMPLETED] no Creation row found for requestId=${requestId}`);
      return;
    }
    if (creation.creditsCharged) {
      // Already charged previously — just make sure status/url are current.
      await prisma.creation.update({ where: { requestId }, data: { status: "completed", imageUrl: videoUrl } });
      return;
    }
    const cost = creation.creditsCost ?? 0;
    await prisma.$transaction([
      prisma.creation.update({ where: { requestId }, data: { status: "completed", imageUrl: videoUrl, creditsCharged: true } }),
      prisma.user.update({ where: { id: creation.userId }, data: { credits: { decrement: cost } } }),
    ]);
  } catch (e) {
    console.error("[MARK_COMPLETED_CHARGE]", e);
  }
}

export async function POST(req) {
  try {
    // Require a signed-in user before allowing status checks.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID required" }, { status: 400 });
    }
    const apiKey = process.env.SEEDANCE_V2_API_KEY;
    const parts = requestId.includes("|||") ? requestId.split("|||") : [null, requestId];
    const [fullModelId, actualRequestId, providedStatusUrl, providedResponseUrl] = parts;
    const modelIdForFallback = fullModelId || "bytedance/seedance-2.0/text-to-video";
    let statusUrl = providedStatusUrl;
    let responseUrl = providedResponseUrl;
    if (!statusUrl) statusUrl = `https://queue.fal.run/${modelIdForFallback}/requests/${actualRequestId}/status`;
    if (!responseUrl) responseUrl = `https://queue.fal.run/${modelIdForFallback}/requests/${actualRequestId}`;

    const res = await fetch(statusUrl, { headers: { "Authorization": `Key ${apiKey}` } });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[CHECK_STATUS] status fetch failed (${res.status}) at ${statusUrl}: ${errText}`);
      return NextResponse.json({ status: "processing" });
    }
    const data = await res.json();

    if (data.status === "COMPLETED") {
      const resultRes = await fetch(responseUrl, { headers: { "Authorization": `Key ${apiKey}` } });
      if (!resultRes.ok) {
        const errText = await resultRes.text().catch(() => "");
        console.error(`[CHECK_STATUS] result fetch failed (${resultRes.status}) at ${responseUrl}: ${errText}`);
        const classified = classifyFalError(errText, resultRes.status);
        prisma.creation
          .update({ where: { requestId }, data: { status: "failed", error: classified.message } })
          .catch((e) => console.error("[UPDATE_CREATION]", e));
        return NextResponse.json({ status: "failed", error: classified.message, errorCode: classified.code });
      }
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        // NEW: this now also deducts credits (once, guarded), instead of just
        // updating status/imageUrl like before.
        await markCompletedAndCharge(requestId, videoUrl);
        return NextResponse.json({ status: "completed", imageUrl: videoUrl });
      }
      console.error(`[CHECK_STATUS] COMPLETED but no video URL found in result:`, JSON.stringify(result));
      return NextResponse.json({ status: "processing" });
    } else if (data.status === "FAILED" || data.status === "ERROR") {
      console.error(`[CHECK_STATUS] generation failed for requestId=${actualRequestId}`, JSON.stringify(data));
      const rawMessage = typeof data.error === "string" ? data.error : JSON.stringify(data.error || data);
      const classified = classifyFalError(rawMessage, undefined);
      prisma.creation
        .update({ where: { requestId }, data: { status: "failed", error: classified.message } })
        .catch((e) => console.error("[UPDATE_CREATION]", e));
      return NextResponse.json({ status: "failed", error: classified.message, errorCode: classified.code });
    }
    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("[CHECK_STATUS] unexpected error:", error);
    return NextResponse.json({ status: "processing" });
  }
}
