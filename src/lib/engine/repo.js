// src/lib/engine/repo.js
// Data access for the engine. The pipeline only talks to this interface, so it
// runs the same against Postgres (PrismaRepo) or memory (MemoryRepo, used by the
// offline self-test in scripts/engine-selftest.js).

const STALE_LOCK_MS = 20 * 60 * 1000; // a RUNNING job with no heartbeat for 20 min is re-claimed

export class PrismaRepo {
  constructor(prisma) {
    this.db = prisma;
  }

  async getProject(id) {
    return this.db.videoProject.findUnique({
      where: { id },
      include: { characters: true, scenes: { orderBy: { index: "asc" } } },
    });
  }

  async updateProject(id, data) {
    return this.db.videoProject.update({ where: { id }, data });
  }

  async heartbeat(id) {
    await this.db.videoProject.update({ where: { id }, data: { lockedAt: new Date() } });
  }

  /** Atomically claim one job: QUEUED first, then RUNNING jobs whose worker died. */
  async claimNext() {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const candidate = await this.db.videoProject.findFirst({
      where: {
        OR: [{ status: "QUEUED" }, { status: "RUNNING", lockedAt: { lt: staleBefore } }],
      },
      orderBy: { updatedAt: "asc" },
      select: { id: true, status: true, lockedAt: true },
    });
    if (!candidate) return null;
    // Compare-and-set on the exact state we read, so two workers can't both win.
    const res = await this.db.videoProject.updateMany({
      where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
      data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    return res.count === 1 ? candidate.id : null;
  }

  async saveScript(projectId, { outline, scenes, characters, narratorVoice }) {
    await this.db.$transaction([
      this.db.projectScene.deleteMany({ where: { projectId } }),
      this.db.projectCharacter.deleteMany({ where: { projectId } }),
      this.db.projectCharacter.createMany({
        data: characters.map((c) => ({
          projectId,
          key: c.key,
          name: c.name,
          gender: c.gender,
          ageGroup: c.ageGroup,
          appearance: c.appearance,
          outfit: c.outfit,
          personality: c.personality || null,
          voice: c.voice || null,
        })),
      }),
      this.db.projectScene.createMany({
        data: scenes.map((s) => ({
          projectId,
          index: s.index,
          narration: s.narration,
          dialogue: s.dialogue,
          visual: s.visual,
          characters: s.characters,
          shot: s.shot,
          action: s.action,
          mood: s.mood,
        })),
      }),
      this.db.videoProject.update({
        where: { id: projectId },
        data: { outline, title: outline.title, narratorVoice },
      }),
    ]);
  }

  async updateCharacter(projectId, key, data) {
    return this.db.projectCharacter.update({ where: { projectId_key: { projectId, key } }, data });
  }

  async updateScene(projectId, index, data) {
    return this.db.projectScene.update({ where: { projectId_index: { projectId, index } }, data });
  }

  /** Give back the credits reserved for a project (once). */
  async refundCredits(projectId) {
    return this.db.$transaction(async (tx) => {
      const p = await tx.videoProject.findUnique({ where: { id: projectId } });
      if (!p || p.creditsRefunded || !p.creditsCharged) return 0;
      await tx.user.update({ where: { id: p.userId }, data: { credits: { increment: p.creditsCharged } } });
      await tx.videoProject.update({ where: { id: projectId }, data: { creditsRefunded: true } });
      return p.creditsCharged;
    });
  }
}

/** In-memory implementation with the same surface, for tests. */
export class MemoryRepo {
  constructor() {
    this.projects = new Map();
  }
  create(project) {
    const p = {
      status: "QUEUED",
      stage: "SCRIPT",
      progress: 0,
      characters: [],
      scenes: [],
      charactersApproved: false,
      planned: false,
      costUsd: 0,
      creditsCharged: 0,
      creditsRefunded: false,
      attempts: 0,
      qaEnabled: true,
      autoApprove: true,
      burnCaptions: false,
      ...project,
    };
    this.projects.set(p.id, p);
    return p;
  }
  async getProject(id) {
    const p = this.projects.get(id);
    return p ? structuredClone({ ...p, scenes: [...p.scenes].sort((a, b) => a.index - b.index) }) : null;
  }
  async updateProject(id, data) {
    Object.assign(this.projects.get(id), data);
  }
  async heartbeat() {}
  async claimNext() {
    for (const p of this.projects.values())
      if (p.status === "QUEUED") {
        p.status = "RUNNING";
        p.attempts++;
        return p.id;
      }
    return null;
  }
  async saveScript(projectId, { outline, scenes, characters, narratorVoice }) {
    const p = this.projects.get(projectId);
    p.outline = outline;
    p.title = outline.title;
    p.narratorVoice = narratorVoice;
    p.characters = characters.map((c) => ({ ...c, masterImageUrl: null, locked: false }));
    p.scenes = scenes.map((s) => ({ ...s }));
  }
  async updateCharacter(projectId, key, data) {
    Object.assign(this.projects.get(projectId).characters.find((c) => c.key === key), data);
  }
  async updateScene(projectId, index, data) {
    Object.assign(this.projects.get(projectId).scenes.find((s) => s.index === index), data);
  }
  async refundCredits(projectId) {
    const p = this.projects.get(projectId);
    if (p.creditsRefunded || !p.creditsCharged) return 0;
    p.creditsRefunded = true;
    return p.creditsCharged;
  }
}
