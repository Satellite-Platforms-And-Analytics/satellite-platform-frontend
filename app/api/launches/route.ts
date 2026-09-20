/**
 * GET /api/launches — what is actually scheduled, and what is only listed.
 *
 * MVP piece 2's surface. The page's entire job is making
 * `net_confidence` visible rather than decorative, so this route sends
 * it and never a pre-formatted date string: a route that decided how to
 * render a time would put the decision in a third place, after the
 * generated column and the component.
 *
 * WHY THE SPLIT IS NOT COMPUTED HERE
 * ==================================
 * `net_confidence` is GENERATED in 020. This route reads it. It does not
 * recompute the tier from `net_precision`, because a tier decided in two
 * places is a tier two surfaces can disagree about — and the whole
 * reason the column exists is that 181 of 363 launches are known only to
 * the year and 35 only to the decade.
 *
 * WHY `upcoming_launches_current` AND NOT THE TABLE
 * =================================================
 * Rows are never deleted; a launch leaves the manifest by happening
 * (AD-092). The base table therefore accumulates everything ever listed,
 * which is the point — it is the only way to ever ask whether a
 * provider's dates slip. The view is what means "in the latest import".
 */
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * The whole manifest is ~363 rows and bounded by definition — "upcoming"
 * cannot grow without bound the way a catalogue can. 500 is headroom,
 * not a ranking cutoff.
 */
const LIMIT = 500;

export type LaunchRow = {
  id: string;
  name: string;
  status: string | null;
  net: string | null;
  net_precision: string | null;
  net_confidence: "dated" | "approximate" | "undated";
  window_start: string | null;
  window_end: string | null;
  provider_name: string | null;
  provider_code: string | null;
  match_method: string | null;
  mission: string | null;
  mission_type: string | null;
  location: string | null;
};

export type LaunchesPayload = {
  launches: LaunchRow[];
  totals: {
    all: number;
    dated: number;
    approximate: number;
    undated: number;
    linked: number;
    providers: number;
  };
};

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      {
        error:
          "SUPABASE_URL and SUPABASE_ANON_KEY are not set. Copy " +
          ".env.example to .env.local for local work, or add them as " +
          "environment variables in the Vercel project.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("upcoming_launches_current")
    // prettier-ignore
    .select("id, name, status_name, net, net_precision, net_confidence, window_start, window_end, provider_name, provider_code, match_method, mission, mission_type, location")
    // NULLS LAST matters: a launch with no net at all must not sort to
    // the top of a list whose first column is a time.
    .order("net", { ascending: true, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    const hint = /relation .* does not exist/i.test(error.message)
      ? " — 020_upcoming_launches.sql may not be applied to this database."
      : "";
    return Response.json({ error: error.message + hint }, { status: 502 });
  }

  const launches: LaunchRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    status: (r.status_name as string | null) ?? null,
    net: (r.net as string | null) ?? null,
    net_precision: (r.net_precision as string | null) ?? null,
    net_confidence: (r.net_confidence as LaunchRow["net_confidence"]) ??
      "undated",
    window_start: (r.window_start as string | null) ?? null,
    window_end: (r.window_end as string | null) ?? null,
    provider_name: (r.provider_name as string | null) ?? null,
    provider_code: (r.provider_code as string | null) ?? null,
    match_method: (r.match_method as string | null) ?? null,
    mission: (r.mission as string | null) ?? null,
    mission_type: (r.mission_type as string | null) ?? null,
    location: (r.location as string | null) ?? null,
  }));

  const totals = {
    all: launches.length,
    dated: launches.filter((l) => l.net_confidence === "dated").length,
    approximate: launches.filter((l) => l.net_confidence === "approximate")
      .length,
    undated: launches.filter((l) => l.net_confidence === "undated").length,
    linked: launches.filter((l) => l.provider_code).length,
    providers: new Set(
      launches.map((l) => l.provider_name).filter(Boolean),
    ).size,
  };

  return Response.json({ launches, totals } satisfies LaunchesPayload);
}
