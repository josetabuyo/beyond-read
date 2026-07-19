# BeyondRead

A minimalist artistic experiment. You choose a poem, activate your camera, and read it
while words light up at your pace. Behind you, you see the previous reader reading the
same poem — your reading is recorded for the next one.

An infinite relay of people reacting to the same text.

## How It Works

1. **You choose a poem** on the home screen (three short poems in `poems/`).
2. **You activate the camera.** Your video dims so the text stands out.
3. **You read** while words light up one by one — automatic mode at your reading pace,
   or manual navigation with arrow keys.
4. Behind you, **the previous reading of that same poem** plays (if one exists — the
   first person to read a poem sees nothing behind, just their camera).
5. When done, your reading is recorded and available for the next reader. You return
   to the home screen.

## Controls During Reading

| Key | Effect |
|---|---|
| `→` | Next word (switches to manual mode) |
| `←` | Previous word (switches to manual mode) |
| `space` | Pause / resume automatic mode |

## Ephemeral and Auto-Balanced Storage

Videos are not stored indefinitely. Each recorded video has a limited number of
plays (1 to 3) before deletion, calculated based on current demand for that poem —
the more active readers a poem has, the fewer plays are assigned to each new video.
This keeps storage bounded without needing a hard limit or external cron:

- Only the latest active video per poem is kept by default (configurable via
  `BEYOND_READ_MAX_PER_POEM`; oldest is evicted if the cap is exceeded).
- Each new video receives `clamp(4 − videos_active, 1, 3)` plays.
- Once views are exhausted, the video enters a 10-minute grace period (in case
  the current reader is still watching) and is then deleted.
- A maximum age fallback (24h) cleans up any orphaned videos.

This logic is split behind two swappable interfaces:

- **Video blobs** (`VideoStorage`, `lib/storage/`): local filesystem
  (`data/videos/`, gitignored) for dev, or **Vercel Blob** in production
  (public access, served straight from the CDN) — picked automatically by
  whether `BLOB_READ_WRITE_TOKEN` is set.
- **View/eviction records** (`MetaStore`, `lib/meta/`): a local JSON file
  (`data/meta.json`, gitignored) for dev, or **Upstash Redis** in production
  — picked automatically by whether `KV_REST_API_URL` /
  `UPSTASH_REDIS_REST_URL` is set. The claim-a-video and
  insert-with-eviction operations run as atomic Lua scripts, since multiple
  serverless instances can hit them concurrently.

## Stack

Next.js (App Router) + TypeScript. No UI libraries. Cormorant Garamond typography
self-hosted via `next/font`. Recording with `MediaRecorder` (`video/webm`, codecs
`vp8`/`opus`). No authentication, no accounts — everything is anonymous and ephemeral
by design.

## Run Locally

```bash
npm install
npm run dev
```

By default it uses the port reserved for this agent in the Local Agent Society port
registry (`las ports claim`). To force a specific port:

```bash
PORT=9005 npm run dev
```

Open `http://localhost:9005` (or whichever port you chose) and grant camera
permissions when the browser asks.

With no further setup, video and view records live on the local filesystem
(`data/`, gitignored). To exercise the production backends locally, pull the
linked project's env vars into `.env.local`:

```bash
vercel env pull .env.local
```

## Tests

```bash
npm test
```

Covers poem tokenization, the automatic reading timing algorithm, and the video
claim/eviction/expiration logic (the trickiest part of the system, since it runs
with concurrent writes).

## Structure

```
poems/                  source poems (plain text, tokenized on the fly)
lib/
  tokenize.ts            text -> words with line/stanza metadata
  timing.ts               word duration algorithm (automatic reading)
  poems.ts                 reads poems/*.txt
  meta/                    view/eviction records: claim, eviction, sweep
    index.ts                 picks the backend (JSON file vs Redis)
    json.ts                  local dev: single JSON file + in-memory queue
    redis.ts                 production: Upstash Redis, atomic Lua scripts
  storage/                 video blobs: local fs vs Vercel Blob
    index.ts                 picks the backend (filesystem vs Blob)
    fs.ts                    local dev implementation
    blob.ts                  production: Vercel Blob (public access)
app/
  page.tsx                 poem picker
  read/[poemId]/page.tsx   reading page
  api/sessions             claims a relay video for the session
  api/recordings           uploads the recording when done reading
  api/videos/[id]          serves the video (with Range support, local fs only —
                            Blob URLs are served directly from the CDN)
components/               client UI: reading stage, karaoke text,
                           relay video backdrop, camera/recording/timing hooks
```

## Deploying

Production runs on Vercel: **Vercel Blob** for video, **Upstash Redis** for
view/eviction records. Both are provisioned once via the Vercel Marketplace
and linked to the project — from then on, `getStorage()` and the meta store
pick the production backend automatically based on which env vars are
present, no code changes needed between environments.

Git integration isn't connected on this project (requires a paid plan for
this account), so deploys go through the CLI instead:

```bash
npm run deploy
```

This runs `vercel deploy --prod` and Vercel keeps the project's default
`beyond-read.vercel.app` domain pointed at the latest production deploy
automatically.
