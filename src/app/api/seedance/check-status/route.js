import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID required" }, { status: 400 });
    }

    const apiKey = process.env.SEEDANCE_V2_API_KEY;
    const res = await fetch(`https://api.muapi.ai/api/v1/request/${requestId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      return NextResponse.json({ status: "processing" });
    }

    const data = await res.json();

    if (data.status === "completed" && (data.output_url || data.video_url)) {
      return NextResponse.json({
        status: "completed",
        imageUrl: data.output_url || data.video_url,
      });
    } else if (data.status === "failed") {
      return NextResponse.json({ status: "failed" });
    } else {
      return NextResponse.json({ status: "processing" });
    }
  } catch (error) {
    return NextResponse.json({ status: "processing" });
  }
}
