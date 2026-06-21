import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID required" }, { status: 400 });
    }
    const apiKey = process.env.SEEDANCE_V2_API_KEY;

    // New format: modelId|||actualRequestId|||statusUrl|||responseUrl
    // Old format (backward compat): modelId|||actualRequestId
    const parts = requestId.includes("|||") ? requestId.split("|||") : [null, requestId];
    const [fullModelId, actualRequestId, providedStatusUrl, providedResponseUrl] = parts;
    const modelIdForFallback = fullModelId || "bytedance/seedance-2.0/text-to-video";

    let statusUrl = providedStatusUrl;
    let responseUrl = providedResponseUrl;

    // Fallback: if we don't have FAL's own URLs (old-format request_id still in flight),
    // reconstruct using the full submission path (NOT stripped — that caused a 405 earlier).
    if (!statusUrl) {
      statusUrl = `https://queue.fal.run/${modelIdForFallback}/requests/${actualRequestId}/status`;
    }
    if (!responseUrl) {
      responseUrl = `https://queue.fal.run/${modelIdForFallback}/requests/${actualRequestId}`;
    }

    const res = await fetch(statusUrl, {
      headers: { "Authorization": `Key ${apiKey}` },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[CHECK_STATUS] status fetch failed (${res.status}) at ${statusUrl}: ${errText}`);
      return NextResponse.json({ status: "processing" });
    }

    const data = await res.json();

    if (data.status === "COMPLETED") {
      const resultRes = await fetch(responseUrl, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      if (!resultRes.ok) {
        const errText = await resultRes.text().catch(() => "");
        console.error(`[CHECK_STATUS] result fetch failed (${resultRes.status}) at ${responseUrl}: ${errText}`);
        return NextResponse.json({ status: "processing" });
      }
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        return NextResponse.json({ status: "completed", imageUrl: videoUrl });
      }
      console.error(`[CHECK_STATUS] COMPLETED but no video URL found in result:`, JSON.stringify(result));
      return NextResponse.json({ status: "processing" });
    } else if (data.status === "FAILED" || data.status === "ERROR") {
      console.error(`[CHECK_STATUS] generation failed for requestId=${actualRequestId}`, JSON.stringify(data));
      return NextResponse.json({ status: "failed" });
    }

    // IN_QUEUE or IN_PROGRESS
    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("[CHECK_STATUS] unexpected error:", error);
    return NextResponse.json({ status: "processing" });
  }
}
