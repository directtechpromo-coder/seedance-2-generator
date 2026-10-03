// src/app/api/engine/projects/[id]/route.js
// GET:    full project (characters, scenes, progress) for the owner
// DELETE: cancel a project that hasn't finished (credits are refunded)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrismaRepo } from "@/lib/engine/repo";

async function loadOwned(id) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Please sign in first." }, { status: 401 }) };
  const project = await prisma.videoProject.findUnique({
    where: { id },
    include: {
      characters: { orderBy: { key: "asc" } },
      scenes: { orderBy: { index: "asc" } },
    },
  });
  if (!project || (project.userId !== session.user.id && !session.user.isAdmin))
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { project, session };
}

export async function GET(_req, { params }) {
  const { id } = await params;
  const { project, error } = await loadOwned(id);
  if (error) return error;
  return NextResponse.json({ project });
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const { project, error } = await loadOwned(id);
  if (error) return error;
  if (["DONE", "FAILED", "CANCELED"].includes(project.status))
    return NextResponse.json({ error: `Project is already ${project.status.toLowerCase()}.` }, { status: 409 });

  await prisma.videoProject.update({ where: { id }, data: { status: "CANCELED" } });
  // A running worker notices CANCELED at its next stage and refunds itself;
  // jobs nobody is working on are refunded right here.
  if (project.status !== "RUNNING") await new PrismaRepo(prisma).refundCredits(id);
  return NextResponse.json({ ok: true });
}
