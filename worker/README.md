# Vidro Long-Video Engine

One prompt → a full 1–15 minute episode with the **same characters and the same voices** from the first scene to the last.

| Mode | What it makes | 10-min cost (API) |
|---|---|---|
| **Story Mode** | Every scene is an AI image with a slow camera move | ~$3.4 |
| **Cinema Mode – Economy** | AI picks ~1 min of real motion | ~$4.5 |
| **Cinema Mode – Standard** | ~2.5 min motion + up to 3 lip-synced close-ups | ~$12 |
| **Cinema Mode – Premium** | ~5 min motion + up to 8 lip-synced close-ups | ~$21.5 |

Costs are fal.ai list prices (Oct 2026), set in `src/lib/engine/config.js`. Users are charged `cost × ENGINE_MARKUP ÷ $0.10` credits up front; failed or canceled videos are refunded automatically.

## How it works

```
Prompt
 → SCRIPT      LLM writes outline + Character Bible, then each ~90s segment (src/lib/engine/script.js)
 → CHARACTERS  one master image per character, LOCKED (worker/media.js)
 → APPROVAL    optional pause so the user can regenerate a character
 → VOICE       one fixed voice per character + narrator, LOCKED (voices.js, worker/tts.js)
 → PLAN        LLM scores each scene; code enforces the motion budget (planner.js)
 → IMAGES      scenes with characters are made FROM the master images (edit model) + QA check
 → MOTION      image-to-video from the scene image + QA check, falls back to still if bad
 → LIPSYNC     only single-speaker close-ups
 → ASSEMBLE    FFmpeg: Ken Burns stills, clips, captions (.srt), music ducking (worker/ffmpeg.js)
```

Every finished asset is uploaded and saved on its scene immediately, so a crashed worker resumes where it stopped and never pays twice.

## Setup (one time)

1. **Database tables** — the schema in `prisma/schema.prisma` gained `VideoProject`, `ProjectCharacter`, `ProjectScene`:
   ```bash
   npx prisma db push
   ```
2. **Vercel** — no change needed. The website creates projects and shows progress; it never renders video.
3. **Worker** — deploy `worker/Dockerfile` as an always-on service (Railway, Render, Fly.io, or any VPS):
   - Railway: New Service → GitHub repo → Settings → Dockerfile path `worker/Dockerfile`
   - Environment variables:
     | Name | Value |
     |---|---|
     | `DATABASE_URL` | same Neon URL as Vercel |
     | `FAL_KEY` | your fal key (or reuse `SEEDANCE_V2_API_KEY`) |
   - 2 vCPU / 2 GB RAM handles one 10-minute video at a time comfortably.

## Optional settings

| Variable | Default | Meaning |
|---|---|---|
| `ENGINE_MARKUP` | `1.0` | Credit price multiplier over API cost. `2` = 100% margin |
| `ENGINE_LLM_MODEL` | `google/gemini-2.5-flash` | Script + planner model (OpenRouter name) |
| `ENGINE_I2V` | Hailuo-02 standard i2v | Motion model |
| `ENGINE_IMAGE_EDIT` / `ENGINE_IMAGE_T2I` | Nano Banana | Image models |
| `ENGINE_CONCURRENCY` | `4` | Parallel API calls per video |
| `ENGINE_RENDER_CONCURRENCY` | `2` | Parallel FFmpeg renders |
| `WORKER_JOBS` | `1` | Videos processed at the same time per worker |

## Test without spending money

```bash
npm run engine:selftest
```
Runs the real pipeline + FFmpeg with mocked AI models: budget caps, lip-sync rules, voice locking, QA regeneration, approval pause, crash-resume, refunds and cancel.

## Run locally

```bash
npm run dev      # website → http://localhost:3000/studio
npm run worker   # in a second terminal (needs ffmpeg installed)
```
