import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID required" }, { status: 400 });
    }
    const apiKey = process.env.SEEDANCE_V2_API_KEY;

    // Parse modelId and actual requestId (format: modelId|||requestId)
    const [fullModelId, actualRequestId] = requestId.includes("|||")
      ? requestId.split("|||")
      : ["bytedance/seedance-2.0/text-to-video", requestId];

    // IMPORTANT: FAL's status/result endpoints require the BASE model_id only
    // (namespace/model-name), WITHOUT any subpath like /text-to-video or /fast.
    // The subpath is only used at submission time. Using the full path here
    // causes the status endpoint to silently fail to find the request, which
    // looks like it's stuck "processing" forever.
    //
    // Examples:
    //   fal-ai/wan/v2.2-a14b/text-to-video        -> fal-ai/wan/v2.2-a14b
    //   fal-ai/wan/v2.2-a14b/image-to-video        -> fal-ai/wan/v2.2-a14b
    //   fal-ai/veo3.1/fast                         -> fal-ai/veo3.1/fast  (this IS the base — no extra subpath)
    //   fal-ai/veo3.1/fast/image-to-video          -> fal-ai/veo3.1/fast
    //   bytedance/seedance-2.0/fast/text-to-video  -> bytedance/seedance-2.0/fast
    //   bytedance/seedance-2.0/text-to-video       -> bytedance/seedance-2.0
    const KNOWN_SUBPATHS = ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"];
    const segments = fullModelId.split("/");
    const lastSegment = segments[segments.length - 1];
    const modelId = KNOWN_SUBPATHS.includes(lastSegment)
      ? segments.slice(0, -1).join("/")
      : fullModelId;

    const res = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}/status`, {
      headers: { "Authorization": `Key ${apiKey}` },
    });

    if (!res.ok) {
      // Log the real failure instead of silently returning "processing" forever.
      const errText = await res.text().catch(() => "");
      console.error(`[CHECK_STATUS] status fetch failed (${res.status}) for modelId=${modelId}: ${errText}`);
      return NextResponse.json({ status: "processing" });
    }

    const data = await res.json();

    if (data.status === "COMPLETED") {
      const resultRes = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}`, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      if (!resultRes.ok) {
        const errText = await resultRes.text().catch(() => "");
        console.error(`[CHECK_STATUS] result fetch failed (${resultRes.status}) for modelId=${modelId}: ${errText}`);
        return NextResponse.json({ status: "processing" });
      }
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        return NextResponse.json({ status: "completed", imageUrl: videoUrl });
      }
      return NextResponse.json({ status: "processing" });
    } else if (data.status === "FAILED" || data.status === "ERROR") {
      console.error(`[CHECK_STATUS] generation failed for modelId=${modelId}, requestId=${actualRequestId}`, data);
      return NextResponse.json({ status: "failed" });
    }

    // IN_QUEUE or IN_PROGRESS
    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("[CHECK_STATUS] unexpected error:", error);
    return NextResponse.json({ status: "processing" });
  }
}
