/**
 * GET /api/research — who is advancing what, and at what maturity.
 *
 * The fourth capability, and the one AD-084 added to the MVP on
 * 2026-09-14 after a survey cancelled the feature this replaces.
 *
 * WHY THIS IS NOT THE PAGE THAT WAS PLANNED
 * =========================================
 * The plan was an edge from `organizations` to `technologies`, populated
 * from TechPort. The survey that was meant to justify it killed it: one
 * distinct lead organisation in thirty-five matched an operator row, and
 * the unmatched list said why — Johnson, JPL, Ames, Kennedy beside
 * Apptronik, Tendeg, Creare, VIP Sensors. Firms that have never operated
 * a spacecraft, which is precisely why an operator catalogue does not
 * name them.
 *
 * TechPort names who does the R&D; GCAT names who operates the hardware
 * (AD-083). Two populations, so this page reads the R&D layer on its own
 * terms and treats the operator link as an attribute where it exists
 * (AD-085) — never as the join that makes a row eligible to appear.
 *
 * WHAT IT REFUSES TO SAY
 * ======================
 * A project's `trlCurrent` describes THAT project's work, not a
 * technology's state of the art, and several projects on one technology
 * legitimately differ (AD-061). So the page reports a RANGE and a count
 * per area, and never a single number called "the TRL of TX08". The mean
 * is shown beside the range rather than instead of it, for the same
 * reason the readiness matrix bands its gaps instead of gradienting
 * them: a number with false precision is read as precise.
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Run on request. With no parameters Next would call this once during
 * `next build` and freeze whatever the database said then — including an
 * error — for as long as the cache lasts. Same reasoning as
 * /api/technologies and /api/organizations.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Performers to return.
 *
 * The distribution is long and thin in the same shape as the operator
 * catalogue: at 1,500 projects imported, 101 distinct performers, and
 * the top of that list is NASA field centres with dozens of projects
 * each. 200 is past the point where the ranking says anything.
 */
const LIMIT = 200;

export type AreaRow = {
  code: string;
  title: string | null;
  projects: number;
  performers: number;
  with_trl: number;
  trl_min: number | null;
  trl_max: number | null;
  trl_mean: number | null;
};

export type PerformerRow = {
  id: number;
  name: string;
  org_type: string | null;
  projects: number;
  with_trl: number;
  trl_max: number | null;
  operator_code: string | null;
  match_method: string | null;
  most_recent: string | null;
};

export type ResearchPayload = {
  areas: AreaRow[];
  performers: PerformerRow[];
  totals: {
    projects: number;
    performers: number;
    linked: number;
    areas_named: number;
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

  const { data: areaRows, error } = await supabase
    .from("research_activity_by_area")
    // prettier-ignore
    .select("tx_area, tx_area_title, projects, performers, projects_with_trl, trl_min, trl_max, trl_mean")
    .order("projects", { ascending: false });

  if (error) {
    // A missing relation reads as a migration that has not been applied,
    // which is a different problem from a failed query and deserves to
    // say so rather than surfacing as an empty page.
    const hint = /relation .* does not exist/i.test(error.message)
      ? " — 015_research_activity.sql / 018_taxonomy_areas.sql may not be" +
        " applied to this database."
      : "";
    return Response.json({ error: error.message + hint }, { status: 502 });
  }

  /**
   * Performers, separately and non-fatally.
   *
   * An area breakdown without the performer list is still a usable
   * answer to "where is the effort", so a failure here degrades the page
   * rather than emptying it — the same call /api/organizations makes
   * about production data.
   */
  const { data: perfRows } = await supabase
    .from("research_organization_summary")
    // prettier-ignore
    .select("id, name, org_type, organization_code, match_method, projects, projects_with_trl, trl_max, most_recent_project")
    .order("projects", { ascending: false })
    .limit(LIMIT);

  const areas: AreaRow[] = (areaRows ?? []).map((r) => ({
    code: r.tx_area as string,
    title: (r.tx_area_title as string | null) ?? null,
    projects: Number(r.projects ?? 0),
    performers: Number(r.performers ?? 0),
    with_trl: Number(r.projects_with_trl ?? 0),
    trl_min: r.trl_min === null ? null : Number(r.trl_min),
    trl_max: r.trl_max === null ? null : Number(r.trl_max),
    trl_mean: r.trl_mean === null ? null : Number(r.trl_mean),
  }));

  const performers: PerformerRow[] = (perfRows ?? []).map((r) => ({
    id: Number(r.id),
    name: r.name as string,
    org_type: (r.org_type as string | null) ?? null,
    projects: Number(r.projects ?? 0),
    with_trl: Number(r.projects_with_trl ?? 0),
    trl_max: r.trl_max === null ? null : Number(r.trl_max),
    operator_code: (r.organization_code as string | null) ?? null,
    match_method: (r.match_method as string | null) ?? null,
    most_recent: (r.most_recent_project as string | null) ?? null,
  }));

  /**
   * Totals are derived from the rows already fetched rather than from
   * extra count queries.
   *
   * `projects` sums the AREA rows, so it counts project-area pairs and
   * NOT distinct projects — a project with two taxonomy nodes would be
   * counted twice. It is labelled on the page as classified projects for
   * that reason. Calling it "projects imported" would be a number that
   * quietly disagrees with the importer's own output.
   */
  const totals = {
    projects: areas.reduce((a, r) => a + r.projects, 0),
    performers: performers.length,
    linked: performers.filter((p) => p.operator_code).length,
    areas_named: areas.filter((a) => a.title).length,
  };

  return Response.json({ areas, performers, totals } satisfies ResearchPayload);
}
