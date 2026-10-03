// worker/engine-worker.js
// Long-Video Engine worker. Vercel functions can't run a 10-minute render, so
// this small always-on Node process does the heavy work:
//   picks QUEUED projects from Postgres → runs the pipeline → saves results.
//
// Run locally:   npm run worker
// Deploy:        see worker/README.md (Railway / Render / any VPS with Docker)

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/prisma.js";
import { PrismaRepo } from "../src/lib/engine/repo.js";
import { runProject } from "../src/lib/engine/worker/pipeline.js";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000);
const JOBS = Number(process.env.WORKER_JOBS || 1); // projects processed in parallel
const WORK_ROOT = process.env.ENGINE_WORKDIR || path.join(os.tmpdir(), "vidro-engine");

const repo = new PrismaRepo(prisma);
let stopping = false;
let active = 0;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

async function processOne() {
  const id = await repo.claimNext();
  if (!id) return false;
  active++;
  log(`claimed project ${id}`);
  const beat = setInterval(() => repo.heartbeat(id).catch(() => {}), 60_000);
  try {
    const result = await runProject(repo, id, { workRoot: WORK_ROOT, log });
    log(`project ${id} → ${result}`);
  } catch (e) {
    log(`project ${id} crashed:`, e);
  } finally {
    clearInterval(beat);
    active--;
  }
  return true;
}

async function loop(slot) {
  while (!stopping) {
    let worked = false;
    try {
      worked = await processOne();
    } catch (e) {
      log(`slot ${slot} poll error:`, e.message);
    }
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log(`${sig} received — finishing current work (${active} active). Unfinished jobs resume on the next worker start.`);
    stopping = true;
    if (!active) process.exit(0);
    setTimeout(() => process.exit(0), 25_000);
  });
}

// Optional health endpoint for hosts that expect a port.
if (process.env.PORT) {
  http
    .createServer((_, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, active }));
    })
    .listen(Number(process.env.PORT));
}

log(`Vidro engine worker started — ${JOBS} slot(s), workdir ${WORK_ROOT}`);
for (let i = 0; i < JOBS; i++) loop(i);
