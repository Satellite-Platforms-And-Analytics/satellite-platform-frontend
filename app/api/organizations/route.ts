/**
 * GET /api/organizations — who has flown what.
 *
 * The second capability this platform surfaces, and the first that is
 * about organisations rather than objects. It reads
 * `organization_activity` (013), a view, because PostgREST cannot express
 * GROUP BY and counting 17,487 satellites in the browser to produce forty
 * numbers is not a trade worth making.
 *
 * WHY THIS COULD NOT HAVE BEEN BUILT LAST WEEK
 * ============================================
 * Until 2026-09-14 `satellites` recorded its operator as a NAME, and the
 * name was GCAT's transliterated native form. A page like this would have
 * listed "Zhongguo kongjian jishu yanjiu yuan" and grouped by string
 * equality. Two changes made it possible: `operator_code` (011) turned
 * the join into a foreign key, and the name preference moved to `EName`
 * so the label is one a reader recognises.
 *
 * A third made it correct rather than merely possible: GCAT keys on JCAT,
 * not the NORAD number, so 1,944 catalogue numbers carried a payload AND
 * its rocket stages. Before that was fixed, this page would have credited
 * launch-vehicle owners with satellites they never operated — plausibly,
 * and with no way to tell from the output.
 *
 * PAYLOADS ARE REPORTED SEPARATELY FROM OBJECTS
 * =============================================
 * A rocket body is something an organisation launched, not something it
 * built to operate. Ranking by `objects` alone rewards whoever left the
 * most debris in orbit, which is a real fact about the world and not the
 * one this page is about.
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Run on request. Same reasoning as /api/technologies: with no
 * parameters Next would call this once during `next build` and freeze
 * whatever the database said then — including an error — and serve it for
 * as long as the cache lasts.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * How many organisations to return.
 *
 * The tail is long and thin: ~90% of catalogued objects belong to about
 * 63 organisations, and the rest have a handful each. 200 is past the
 * point where the ranking says anything, and small enough to send.
 * Everything below it is reachable by search once that exists, rather
 * than by scrolling.
 */
const LIMIT = 200;

/**
 * The window the production sparkline covers, in years back from now.
 *
 * FIXED, AND THE SAME FOR EVERY ROW. A sparkline whose x-range adapts to
 * each organisation cannot be compared down a column — two rows of the
 * same shape would mean different things, which is the defect this page
 * already had once when bar length and ranking disagreed.
 *
 * 24 years reaches back past the modern constellation era to a period
 * when annual output was in single digits for almost everyone, so the
 * shape shows a ramp rather than a plateau.
 */
const PRODUCTION_WINDOW_YEARS = 24;

export type OrganizationRow = {
  code: string;
  name: string;
  short: string | null;
  org_type: string | null;
  state_code: string | null;
  objects: number;
  payloads: number;
  first_flight: string | null;
  last_flight: string | null;
  active_years: number | null;
  /** Payloads per year across the shared window; index 0 is `windowStart`. */
  production: number[];
  peak_payloads: number | null;
  peak_year: number | null;
  payloads_last_5y: number | null;
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
    .from("organization_activity")
    // prettier-ignore
    .select("code, display_name, name_short, org_type, state_code, objects, payloads, first_flight, last_flight, active_years")
    .order("objects", { ascending: false })
    .limit(LIMIT);

  if (error) {
    // A missing view reads as a migration that has not been applied,
    // which is a different problem from a failed query and deserves to
    // say so rather than surfacing as an empty page.
    const hint = /relation .* does not exist/i.test(error.message)
      ? " — 013_organization_activity.sql may not be applied to this database."
      : "";
    return Response.json({ error: error.message + hint }, { status: 502 });
  }

  const codes = (data ?? []).map((r) => r.code as string);
  const thisYear = new Date().getUTCFullYear();
  const windowStart = thisYear - PRODUCTION_WINDOW_YEARS + 1;

  // Production evidence (014). Two reads rather than one: a per-year
  // series for the sparkline, and the peak/recent summary, which answer
  // different questions and are computed differently. Neither is fatal —
  // an organisation list without production is still a list, and failing
  // the whole page because a view is missing would make 013 and 014 a
  // single point of failure they need not be.
  const byCode = new Map<string, number[]>();
  const summary = new Map<
    string,
    { peak: number | null; peakYear: number | null; last5: number | null }
  >();

  if (codes.length) {
    const { data: prod } = await supabase
      .from("organization_production")
      .select("code, year, payloads")
      .in("code", codes)
      .gte("year", windowStart);

    for (const p of prod ?? []) {
      const code = p.code as string;
      const idx = (p.year as number) - windowStart;
      if (idx < 0 || idx >= PRODUCTION_WINDOW_YEARS) continue;
      const series =
        byCode.get(code) ?? new Array(PRODUCTION_WINDOW_YEARS).fill(0);
      series[idx] = Number(p.payloads ?? 0);
      byCode.set(code, series);
    }

    const { data: sum } = await supabase
      .from("organization_production_summary")
      .select("code, peak_payloads, peak_year, payloads_last_5y")
      .in("code", codes);

    for (const s of sum ?? []) {
      summary.set(s.code as string, {
        peak: s.peak_payloads === null ? null : Number(s.peak_payloads),
        peakYear: s.peak_year === null ? null : Number(s.peak_year),
        last5: s.payloads_last_5y === null ? null : Number(s.payloads_last_5y),
      });
    }
  }

  const organizations: OrganizationRow[] = (data ?? []).map((r) => ({
    code: r.code as string,
    name: r.display_name as string,
    short: (r.name_short as string | null) ?? null,
    org_type: (r.org_type as string | null) ?? null,
    state_code: (r.state_code as string | null) ?? null,
    objects: Number(r.objects ?? 0),
    payloads: Number(r.payloads ?? 0),
    first_flight: (r.first_flight as string | null) ?? null,
    last_flight: (r.last_flight as string | null) ?? null,
    active_years: r.active_years === null ? null : Number(r.active_years),
    production:
      byCode.get(r.code as string) ??
      new Array(PRODUCTION_WINDOW_YEARS).fill(0),
    peak_payloads: summary.get(r.code as string)?.peak ?? null,
    peak_year: summary.get(r.code as string)?.peakYear ?? null,
    payloads_last_5y: summary.get(r.code as string)?.last5 ?? null,
  }));

  const totalObjects = organizations.reduce((a, o) => a + o.objects, 0);
  const totalPayloads = organizations.reduce((a, o) => a + o.payloads, 0);

  return Response.json(
    {
      count: organizations.length,
      limit: LIMIT,
      // These total the RETURNED organisations, not the catalogue. Saying
      // so in the payload rather than in a comment, because a number
      // called "total" on a truncated list is how a page ends up claiming
      // a coverage it does not have.
      totals: { objects: totalObjects, payloads: totalPayloads,
                scope: `top ${organizations.length} organisations by object count` },
      window: { start: windowStart, end: thisYear },
      organizations,
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
