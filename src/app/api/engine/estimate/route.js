// src/app/api/engine/estimate/route.js
// Price preview for the Long-Video Studio form (no auth needed, no side effects).

import { NextResponse } from "next/server";
import { estimateProject } from "@/lib/engine/cost";
import { parseProjectInput } from "@/lib/engine/validate";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { data } = parseProjectInput({ prompt: "estimate only placeholder", ...body });
  return NextResponse.json(
    estimateProject({
      mode: data.mode,
      planKey: data.plan,
      minutes: data.targetMinutes,
      ttsProvider: data.ttsProvider,
      language: data.language,
      qa: data.qaEnabled,
    })
  );
}
