export const AIService = {
  async generate(userId, { mode, prompt, aspect_ratio = "16:9", resolution = "720p", duration = 5, quality = "basic", images_list = [] }) {
    const apiKey = process.env.SEEDANCE_V2_API_KEY;
    if (!apiKey) throw new Error("SEEDANCE_V2_API_KEY is not configured");

    // Map mode to FAL endpoint
    let modelId;
    if (mode === "text-to-video") {
      modelId = quality === "high"
        ? "bytedance/seedance-2.0/text-to-video"
        : "bytedance/seedance-2.0/fast/text-to-video";
    } else if (mode === "image-to-video") {
      modelId = quality === "high"
        ? "bytedance/seedance-2.0/image-to-video"
        : "bytedance/seedance-2.0/fast/image-to-video";
    } else if (mode === "reference-to-video") {
      modelId = quality === "high"
        ? "bytedance/seedance-2.0/reference-to-video"
        : "bytedance/seedance-2.0/fast/reference-to-video";
    }

    const payload = {
      prompt,
      resolution,
      duration: String(duration),
      aspect_ratio,
      generate_audio: true,
    };

    if (mode === "image-to-video" && images_list.length > 0) {
      payload.image_url = images_list[0];
    }

    if (mode === "reference-to-video" && images_list.length > 0) {
      payload.reference_assets = images_list.slice(0, 9).map((url, i) => ({
        type: "image",
        url,
        tag: `Image${i + 1}`,
      }));
    }

    // Submit to FAL queue
    const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`FAL API Submission Failed: ${submitRes.status} ${errorText}`);
    }

    const { request_id } = await submitRes.json();
    if (!request_id) throw new Error("No request_id received from FAL API");

    // Store modelId in request_id for status checking
    return { request_id: `${modelId}|||${request_id}` };
  },

  async checkStatus(requestId) {
    const apiKey = process.env.SEEDANCE_V2_API_KEY;

    // Parse modelId and actual requestId
    const [modelId, actualRequestId] = requestId.includes("|||")
      ? requestId.split("|||")
      : ["bytedance/seedance-2.0/text-to-video", requestId];

    const res = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}/status`, {
      headers: { "Authorization": `Key ${apiKey}` },
    });

    if (!res.ok) return { status: "processing" };

    const data = await res.json();

    if (data.status === "COMPLETED") {
      // Fetch the result
      const resultRes = await fetch(`https://queue.fal.run/${modelId}/requests/${actualRequestId}`, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      if (!resultRes.ok) return { status: "processing" };
      const result = await resultRes.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.url;
      if (videoUrl) {
        return { status: "completed", imageUrl: videoUrl };
      }
      return { status: "processing" };
    } else if (data.status === "FAILED") {
      return { status: "failed" };
    }

    return { status: "processing" };
  }
};
