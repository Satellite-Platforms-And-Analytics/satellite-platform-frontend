/**
 * GET /api/tles — element sets for the browser to propagate itself.
 *
 * WHY THE BROWSER PROPAGATES (AD-020)
 * ===================================
 * The obvious design is to read `orbital_positions` and hand the client
 * finished lat/lon. It was measured and rejected: smooth motion needs
 * ~5-minute resolution, which for 18,000 objects is 2.3M rows a day, about
 * 498 MB of a 500 MB tier, and ~12,960 GitHub Actions minutes a month
 * against a 2,000 minute allowance. It also would not deliver — scheduled
 * workflows on shared runners land hours apart.
 *
 * A TLE is ~140 bytes and stays usable for days. Ship those instead and
 * let satellite.js do SGP4 in the browser: smooth motion at any frame
 * rate, zero per-frame server cost. `orbital_positions` still exists, for
 * history and analytics rather than for this globe.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A DIRECT SUPABASE CALL
 * =========================================================
 * The anon key would be safe to expose — RLS is on and anon holds SELECT
 * only. But routing through here keeps the query shape server-side, lets
 * the response be cached at the edge for every visitor at once rather than
 * per browser, and means the payload can be trimmed to the four columns
 * SGP4 actually needs instead of whole rows.
 */
import { createClient } from "@supabase/supabase-js";

export const revalidate = 1800; // 30 min; upstream refreshes every 2 hours

/**
 * How many objects to send by default.
 *
 * The catalogue is 18,044 objects. Sending all of them is ~2.7 MB and asks
 * the browser for 18,044 SGP4 solutions per frame, which is not a globe,
 * it is a space heater. 1,500 is comfortable on a laptop at 60fps and
 * still looks like a populated sky. Callers can raise it deliberately.
 */
const DEFAULT_LIMIT = 1500;
const MAX_LIMIT = 8000;

export type TleRow = {
  norad_id: number;
  name: string;
  line1: string;
  line2: string;
  orbit_regime: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);

  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const regime = url.searchParams.get("regime"); // LEO | MEO | GEO | HEO

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Fail loudly and specifically. A missing environment variable that
  // degrades into an empty list is the failure mode this project has hit
  // repeatedly: the page would render an empty sky and look merely quiet.
  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      {
        error:
          "SUPABASE_URL and SUPABASE_ANON_KEY are not set. Copy " +
          ".env.example to .env.local for local work, or add them " +
          "as environment variables in the Vercel project.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // PostgREST caps a single response at `max-rows` (1000 on this project)
  // and does not say it has done so - asking for 1500 quietly returns
  // 1000. Page explicitly with .range() so the cap is a page size rather
  // than an invisible ceiling.
  const PAGE = 1000;

  const all: TleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let page = supabase
      .from("satellites")
      .select("norad_id, name, tle_line1, tle_line2, orbit_regime")
      .not("tle_line1", "is", null)
      .not("tle_line2", "is", null)
      // Ordered, because a range without an ORDER BY returns an arbitrary
      // subset that can differ between calls — the same bug that made
      // src/resources.py return different results on different machines.
      .order("norad_id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (regime) page = page.eq("orbit_regime", regime.toUpperCase());

    const { data, error } = await page;
    if (error) return Response.json({ error: error.message }, { status: 502 });

    const rows = data ?? [];
    for (const r of rows) {
      all.push({
        norad_id: r.norad_id as number,
        name: (r.name as string) ?? "UNKNOWN",
        line1: r.tle_line1 as string,
        line2: r.tle_line2 as string,
        orbit_regime: (r.orbit_regime as string | null) ?? null,
      });
    }
    if (rows.length < PAGE) break;          // last page
    if (all.length >= MAX_LIMIT * 4) break; // safety valve
  }

  // Sample evenly across the catalogue rather than taking the first N.
  //
  // norad_id is issued in launch order, so "ORDER BY norad_id LIMIT 1500"
  // is not a sample of the catalogue - it is the 1,500 oldest objects in
  // it, a globe made entirely of 1960s and 70s rocket bodies with no
  // Starlink, no ISS, and a GEO belt that has not been populated yet.
  // It looked plausible, which is what made it worth catching.
  //
  // Taking every Nth row keeps the spread across launch era, altitude and
  // operator, and stays deterministic so the same request returns the
  // same objects.
  const total = all.length;
  const step = Math.max(1, Math.ceil(total / limit));
  const satellites =
    step === 1 ? all : all.filter((_, i) => i % step === 0).slice(0, limit);

  return Response.json(
    {
      count: satellites.length,
      total,
      sampled: satellites.length < total,
      limit,
      regime: regime ?? null,
      satellites,
    },
    {
      headers: {
        // max-age=0 is the important part. Without it there is no
        // freshness directive for a *browser*, so it applies heuristic
        // caching and keeps serving its own copy - which is how a fixed
        // route kept rendering the old 1,000-object payload after the fix
        // had shipped. s-maxage still lets the CDN hold it for 30
        // minutes, which is where the caching is actually wanted: one
        // copy shared by every visitor, not one pinned per browser.
        "Cache-Control":
          "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}
