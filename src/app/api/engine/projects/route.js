// src/app/api/engine/projects/route.js
// POST: create a Long-Video project (reserves credits, queues it for the worker)
// GET:  list the signed-in user's projects

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateProject } from "@/lib/engine/cost";
import { parseProjectInput } from "@/lib/engine/validate";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const userId = session.user.id;
  const isAdmin = Boolean(session.user.isAdmin);

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { errors, data } = parseProjectInput(body);
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  const estimate = estimateProject({
    mode: data.mode,
    planKey: data.plan,
    minutes: data.targetMinutes,
    ttsProvider: data.ttsProvider,
    language: data.language,
    qa: data.qaEnabled,
  });
  const credits = isAdmin ? 0 : estimate.credits;

  try {
    const project = await prisma.$transaction(async (tx) => {
      if (credits > 0) {
        // Conditional decrement: never lets credits go negative, even with parallel requests.
        const res = await tx.user.updateMany({
          where: { id: userId, credits: { gte: credits } },
          data: { credits: { decrement: credits } },
        });
        if (res.count !== 1) {
          const u = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
          const err = new Error(`Insufficient credits. This video needs ${credits} credits, you have ${u?.credits ?? 0}.`);
          err.status = 402;
          throw err;
        }
      }
      return tx.videoProject.create({
        data: { ...data, userId, estimate, creditsCharged: credits, status: "QUEUED", stage: "SCRIPT" },
      });
    });
    return NextResponse.json({ project, estimate }, { status: 201 });
  } catch (e) {
    if (e.status === 402) return NextResponse.json({ error: e.message }, { status: 402 });
    console.error("[ENGINE_CREATE]", e);
    return NextResponse.json({ error: "Could not create the project." }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const projects = await prisma.videoProject.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      prompt: true,
      mode: true,
      plan: true,
      language: true,
      targetMinutes: true,
      status: true,
      stage: true,
      progress: true,
      error: true,
      finalVideoUrl: true,
      thumbnailUrl: true,
      durationSec: true,
      creditsCharged: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ projects });
}
