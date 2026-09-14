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
