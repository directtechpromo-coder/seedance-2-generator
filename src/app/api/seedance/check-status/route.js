import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID required" }, { status: 400 });
    }

    const apiKey = process.env.SEEDANCE_V2_API_KEY;

    // Parse modelId and actual requestId (format: modelId|||requestId)
    const [modelId, actualRequestId] = requestId.includes("|||")
      ? requestId.split("|||")
      : ["bytedance/seedance-2.0/text-to-video", requestId];

    const res = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}/status`, {
      headers: { "Authorization": `Key ${apiKey}` },
    });

    if (!res.ok) return NextResponse.json({ status: "processing" });

    const data = await res.json();

    if (data.status === "COMPLETED") {
      const resultRes = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}`, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      if (!resultRes.ok) return NextResponse.json({ status: "processing" });
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        return NextResponse.json({ status: "completed", imageUrl: videoUrl });
      }
      return NextResponse.json({ status: "processing" });
    } else if (data.status === "FAILED") {
      return NextResponse.json({ status: "failed" });
    }

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    return NextResponse.json({ status: "processing" });
  }
}
