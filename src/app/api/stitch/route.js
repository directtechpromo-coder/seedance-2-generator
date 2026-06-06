import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { videoUrls } = await req.json();
    if (!videoUrls || videoUrls.length === 0) {
      return NextResponse.json({ error: "No video URLs provided" }, { status: 400 });
    }

    // Download all videos as buffers
    const videoBuffers = await Promise.all(
      videoUrls.map(async (url) => {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        return Buffer.from(buffer);
      })
    );

    // Concatenate all MP4 buffers
    const combined = Buffer.concat(videoBuffers);

    return new Response(combined, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "attachment; filename=final-video.mp4",
      },
    });
  } catch (error) {
    console.error("[STITCH]", error);
    return NextResponse.json({ error: "Stitch failed" }, { status: 500 });
  }
}
