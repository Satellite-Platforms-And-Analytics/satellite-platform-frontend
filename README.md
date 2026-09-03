# satellite-platform-frontend

Live satellite positions on an orthographic globe, propagated in the
browser from element sets ingested by
[`satellite-platform-ingestion`](https://github.com/Satellite-Platforms-And-Analytics/satellite-platform-ingestion).

## Why the browser does the propagation

The obvious design — read `orbital_positions` and hand the client finished
lat/lon — was measured and rejected (AD-020). Smooth motion needs roughly
5-minute resolution, which for 18,000 objects is 2.3M rows a day: about
498 MB of a 500 MB Supabase tier, and ~12,960 GitHub Actions minutes a
month against a 2,000 minute allowance. Scheduled workflows on shared
runners also land hours apart, so it would not have delivered that
resolution anyway.

A TLE is ~140 bytes and stays usable for days. `/api/tles` ships those and
satellite.js runs SGP4 here, giving smooth motion at any frame rate for
zero per-frame server cost. `orbital_positions` still exists — for history
and analytics, not for this globe.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_URL + SUPABASE_ANON_KEY
npm run dev
```

`SUPABASE_ANON_KEY` is the anon key, not the service_role key. It is safe
because row-level security is on and `001_core_schema.sql` grants anon a
SELECT policy only. The keys are read server-side by the API route, so the
browser never talks to Supabase directly.

## Deploying

Vercel, importing this repo. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as
environment variables in the project settings — the API route returns an
explicit 500 naming both variables if they are missing, rather than
rendering an empty sky that looks merely quiet.

## Layout

```
app/
  api/tles/route.ts   element sets, trimmed to what SGP4 needs, edge-cached
  page.tsx            server component, renders the globe
  layout.tsx
  globals.css
components/
  Globe.tsx           canvas + d3-geo + satellite.js, client component
```

Canvas rather than SVG: 1,500 satellites is 1,500 DOM nodes per frame in
SVG. d3-geo supplies the projection either way; only the renderer differs.

## Query parameters

| Parameter | Default | Notes |
|---|---|---|
| `limit` | 1500 | Capped at 8000. The full catalogue is ~18,000 objects (~2.7 MB), which is more SGP4 per frame than a laptop enjoys |
| `regime` | — | `LEO` / `MEO` / `GEO` / `HEO` |

## Verified

`npm run build` and `tsc --noEmit` both clean. The missing-environment path
was exercised against a running server and returns 500 with both variable
names, not an empty list.
