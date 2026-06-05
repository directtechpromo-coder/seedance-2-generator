import config from "@/lib/config";

export const AIService = {
  async generate(userId, { mode, prompt, aspect_ratio = "16:9", resolution = "720p", duration = 5, quality = "basic", images_list = [], video_files = [], audio_files = [] }) {
    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) throw new Error("SEEDANCE_V2_API_KEY is not configured");

    let type;
    if (mode === "text-to-video") type = "t2v";
    else if (mode === "image-to-video") type = "i2v";
    else if (mode === "reference-to-video") type = "reference";

    const endpoint = config.ai.seedance.endpoints[type][resolution];
    if (!endpoint) throw new Error(`Endpoint not found for mode: ${mode}`);

    const payload = {
      prompt,
      aspect_ratio,
      duration: parseInt(duration),
      quality
    };

    if (type === "i2v" || type === "reference") {
      payload.images_list = images_list.slice(0, 9);
    }

    const submitRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`API Submission Failed: ${submitRes.status} ${errorText}`);
    }

    const { request_id } = await submitRes.json();
    if (!request_id) throw new Error("No request_id received from API");

    return { request_id };
  },

  async checkStatus(requestId) {
    const apiKey = config.ai.seedance.apiKey;
    const res = await fetch(`https://api.muapi.ai/api/v1/request/${requestId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) return { status: "processing" };

    const data = await res.json();

    if (data.status === "completed" && (data.output_url || data.video_url)) {
      return { status: "completed", imageUrl: data.output_url || data.video_url };
    } else if (data.status === "failed") {
      return { status: "failed" };
    }

    return { status: "processing" };
  }
};
