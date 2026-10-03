// src/app/api/engine/projects/[id]/approve/route.js
// Character approval step (only used when autoApprove is off).
//   { action: "approve" }                                  → lock characters, continue
//   { action: "regenerate", key, appearance?, outfit? }    → redo one character's master image

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req, { params }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const project = await prisma.videoProject.findUnique({ where: { id }, include: { characters: true } });
  if (!project || (project.userId !== session.user.id && !session.user.isAdmin))
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (project.status !== "AWAITING_APPROVAL")
    return NextResponse.json({ error: "This project is not waiting for approval." }, { status: 409 });

  const body = await req.json().catch(() => ({}));

  if (body.action === "approve") {
    await prisma.videoProject.update({ where: { id }, data: { charactersApproved: true, status: "QUEUED" } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "regenerate") {
    const ch = project.characters.find((c) => c.key === body.key);
    if (!ch) return NextResponse.json({ error: "Unknown character." }, { status: 400 });
    const data = { masterImageUrl: null, locked: false };
    if (typeof body.appearance === "string" && body.appearance.trim()) data.appearance = body.appearance.trim().slice(0, 600);
    if (typeof body.outfit === "string" && body.outfit.trim()) data.outfit = body.outfit.trim().slice(0, 400);
    await prisma.$transaction([
      prisma.projectCharacter.update({ where: { id: ch.id }, data }),
      // Worker regenerates this master, then pauses for approval again.
      prisma.videoProject.update({ where: { id }, data: { status: "QUEUED" } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
