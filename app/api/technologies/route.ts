/**
 * GET /api/technologies — the curated TRL/MRL assessments.
 *
 * Epic 3.0's data half shipped 2026-09-12: `009_domains_and_technology.sql`
 * plus 69 curated records loaded by `src/catalog/seed_technologies.py`.
 * This is the first route that surfaces any of it. Until it existed the
 * only way to see the readiness gap was a terminal command, which is the
 * same imbalance the 09-12 direction change was called to fix.
 *
 * WHY THREE PLAIN SELECTS AND NOT A POSTGREST EMBED
 * =================================================
 * `select=...,technology_categories(name)` would fetch the category name
 * in one round trip, but it depends on PostgREST detecting the foreign key
 * and on the embed alias resolving the way it is written. When it does not
 * resolve, the field comes back absent rather than as an error — every
 * technology would render with a blank category and the page would look
 * merely sparse.
 *
 * The tables here are 1 domain, 13 categories and 69 technologies. Three
 * selects cost three round trips against a route that is cached for an
 * hour, and each one fails loudly and separately. That trade is only this
 * lopsided because the data is small; do not copy this shape to
 * `satellites`, where /api/tles pages deliberately.
 *
 * WHY THE TTL IS NOT 1800
 * =======================
 * /api/tles revalidates every 30 minutes because upstream moves every two
 * hours — its TTL is derived from a clock outside the project. Readiness
 * assessments have no such clock. They change when somebody edits
 * `data/seed/technologies.json` and runs `--apply`, which is an act, not a
 * process. So the question is not "how often does the source move" but
 * "how long am I willing to look at a stale number after re-seeding", and
 * the answer is an hour. Copying 1800 would have carried over a reason
 * that does not apply here.
 *
 * WHY `band` IS COMPUTED HERE (AD-059)
 * ====================================
 * The curated gap distribution is 0, +1 and +2 and nothing else — never 3,
 * never negative. That is the shape of how the 69 were assessed, not of
 * the world, so the data supports *which* technologies carry a readiness
 * gap and not *how large* it is. Rendering `readiness_gap` on a continuous
 * scale would assert precision nobody assessed.
 *
 * Banding server-side puts that rule in one place instead of trusting each
 * future chart to remember it. `readiness_gap` is still returned, because
 * hiding it would be its own kind of lie.
 *
 * `assessment_basis` IS NOT OPTIONAL IN THIS PAYLOAD
 * ==================================================
 * The standing rule from the Technology Assessment Framework is that the
 * tier travels with the number all the way to the pixel. A route that
 * drops the basis makes that impossible downstream no matter how careful
 * the component is, so it ships with every row. 009 makes the column NOT
 * NULL for the same reason.
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Run on request, never at build time.
 *
 * This route takes no parameters, so Next would happily treat it as static
 * and call GET once during `next build` — baking whatever Supabase said at
 * that moment into the output. If the build machine cannot reach Supabase,
 * or 009 has not been applied yet, the *error response* is what gets
 * frozen and served. A page that says "the space domain is missing" for an
 * hour after a perfectly good deploy is precisely this project's recurring
 * failure shape: a stale artefact that looks like a current answer.
 *
 * Caching still happens, just at the edge rather than at build: the
 * `Cache-Control` header below gives the CDN an hour, which is where the
 * caching is actually wanted.
 */
export const dynamic = "force-dynamic";

/**
 * 83 rows across three selects. The 30s ceiling on /api/tles exists
 * because reading the whole catalogue is ~19 sequential round trips; this
 * is three, so the generous number would be cargo cult. If this ever times
 * out, something is wrong that a bigger budget would only hide.
 */
export const maxDuration = 15;

/** The domain this route serves. `space` is a row, not an assumption. */
const DOMAIN_SLUG = "space";

export type ReadinessBand = "aligned" | "lagging" | "outrun";

export type TechnologyRow = {
  ref: string;
  name: string;
  category: string | null;
  trl: number | null;
  mrl: number | null;
  readiness_gap: number | null;
  band: ReadinessBand | null;
  assessment_basis: string;
  description: string | null;
  source_confidence: number | null;
};

/**
 * Three bands, not a scale.
 *
 * `outrun` is the set this epic exists to show: capability demonstrated,
 * supply chain not caught up. A negative gap would mean a mature
 * production base under an unproven design — real, and entirely absent
 * from the curated set, which means nobody looked rather than that none
 * exist. It bands as `aligned` because there is no honest third direction
 * to put it in yet, and it should become its own band the moment a source
 * produces one.
 */
function bandFor(gap: number | null): ReadinessBand | null {
  if (gap === null) return null;
  if (gap >= 2) return "outrun";
  if (gap === 1) return "lagging";
  return "aligned";
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Same loud failure as /api/tles. A missing variable that degrades into
  // an empty list is the failure mode this project has hit repeatedly: the
  // page would render an empty matrix and look merely unpopulated.
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

  const fail = (message: string, status = 502) =>
    Response.json({ error: message }, { status });

  // 1 — the domain. Named separately so "no space domain" reads as
  // "009 has not been applied to this database" rather than as "no
  // technologies", which is what a silent join would produce.
  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, slug, name")
    .eq("slug", DOMAIN_SLUG)
    .maybeSingle();

  if (domainError) return fail(domainError.message);
  if (!domain) {
    return fail(
      `No '${DOMAIN_SLUG}' row in \`domains\`. Apply ` +
        "009_domains_and_technology.sql to this database.",
      503,
    );
  }

  // 2 — categories, 13 of them. Fetched as a map rather than embedded so a
  // technology whose category is missing shows up as null and is visible,
  // instead of silently vanishing from a join.
  const { data: categories, error: categoryError } = await supabase
    .from("technology_categories")
    .select("id, name")
    .eq("domain_id", domain.id);

  if (categoryError) return fail(categoryError.message);

  const categoryName = new Map<number, string>(
    (categories ?? []).map((c) => [c.id as number, c.name as string]),
  );

  // 3 — the assessments. 69 rows, one page; PostgREST's 1,000-row cap is
  // nowhere near. Ordered so the set this epic exists for comes first.
  const { data: rows, error: rowError } = await supabase
    .from("technologies")
    // One string literal, deliberately: supabase-js parses the select at
    // the type level, and a concatenated expression is opaque to it — the
    // rows come back typed as a parse error and every field access fails
    // to compile. Long line, correct types.
    // prettier-ignore
    .select("ref, name, category_id, trl, mrl, readiness_gap, assessment_basis, description, source_confidence")
    .eq("domain_id", domain.id)
    .order("readiness_gap", { ascending: false, nullsFirst: false })
    .order("ref", { ascending: true });

  if (rowError) return fail(rowError.message);

  const technologies: TechnologyRow[] = (rows ?? []).map((r) => ({
    ref: r.ref as string,
    name: r.name as string,
    category:
      r.category_id === null
        ? null
        : (categoryName.get(r.category_id as number) ?? null),
    trl: (r.trl as number | null) ?? null,
    mrl: (r.mrl as number | null) ?? null,
    readiness_gap: (r.readiness_gap as number | null) ?? null,
    band: bandFor((r.readiness_gap as number | null) ?? null),
    assessment_basis: r.assessment_basis as string,
    description: (r.description as string | null) ?? null,
    source_confidence: (r.source_confidence as number | null) ?? null,
  }));

  // Reported so the page can say what it is showing rather than implying
  // completeness. 69 curated records are a seed, not a census of the
  // domain, and a count with no denominator invites the opposite reading.
  const bands = { outrun: 0, lagging: 0, aligned: 0, unknown: 0 };
  for (const t of technologies) {
    if (t.band === null) bands.unknown += 1;
    else bands[t.band] += 1;
  }

  return Response.json(
    {
      domain: { slug: domain.slug, name: domain.name },
      count: technologies.length,
      categories: (categories ?? []).length,
      bands,
      technologies,
    },
    {
      headers: {
        // max-age=0 for the same reason as /api/tles: without a freshness
        // directive the browser applies heuristic caching and keeps
        // serving its own copy after a fix has shipped. The CDN holds it
        // for an hour, which is where the caching is actually wanted.
        "Cache-Control":
          "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
