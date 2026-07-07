import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  try {
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
        return NextResponse.json({ status: "processing" });
      }
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        prisma.creation
          .update({ where: { requestId }, data: { status: "completed", imageUrl: videoUrl } })
          .catch((e) => console.error("[UPDATE_CREATION]", e));
        return NextResponse.json({ status: "completed", imageUrl: videoUrl });
      }
      console.error(`[CHECK_STATUS] COMPLETED but no video URL found in result:`, JSON.stringify(result));
      return NextResponse.json({ status: "processing" });
    } else if (data.status === "FAILED" || data.status === "ERROR") {
      console.error(`[CHECK_STATUS] generation failed for requestId=${actualRequestId}`, JSON.stringify(data));
      prisma.creation.update({ where: { requestId }, data: { status: "failed" } }).catch((e) => console.error("[UPDATE_CREATION]", e));
      return NextResponse.json({ status: "failed" });
    }

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("[CHECK_STATUS] unexpected error:", error);
    return NextResponse.json({ status: "processing" });
  }
}
