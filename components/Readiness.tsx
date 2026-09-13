"use client";

/**
 * The readiness matrix and the gap view — Epic 3.0's product half.
 *
 * `seed_technologies.py --gap` already prints the content this renders, so
 * the question here was never what to show. It was whether the numbers
 * survive the trip to a screen with their meaning intact, which is where
 * this project's failures have historically happened.
 *
 * WHAT THE DATA ACTUALLY SUPPORTS, AND WHAT IT DOES NOT
 * =====================================================
 * 69 curated assessments occupy **12 of the 81 TRL x MRL cells**, all of
 * them on or just above the diagonal, and TRL 1-3 is completely empty. Two
 * separate compressions:
 *
 *   1. The gap is 0, +1 or +2 and never anything else. So "which
 *      technologies have a readiness gap" is answerable and "how large is
 *      the gap" is not (AD-059). Hence bands, never a gradient.
 *   2. Nothing sits below TRL 4. The curated set covers *demonstrated*
 *      technology and says nothing at all about what is emerging.
 *
 * The grid is drawn full 9x9 rather than cropped to the populated range
 * for exactly that reason. Cropping would make the data look like a
 * complete picture of the domain; the empty two-thirds is the honest
 * headline, and it is the argument for the assessment framework.
 *
 * COLOUR
 * ======
 * Two ordinal ramps, both one-hue and both validated against this app's
 * actual surface (#070b14) rather than a reference surface:
 *
 *   cell count  blue   #184f95 -> #2a78d6 -> #5598e7 -> #9ec5f4
 *   gap band    orange #8f3a14 -> #cf5520 -> #ef8a5c
 *
 * Brighter means more, because on a dark surface the light end is the one
 * that advances. Neither ramp is a gradient over a continuous value: the
 * cell ramp is four labelled bins and the band ramp is three named bands,
 * every one of which also carries its name in text. Nothing here is
 * encoded by colour alone.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReadinessBand, TechnologyRow } from "@/app/api/technologies/route";

type Payload = {
  domain: { slug: string; name: string };
  count: number;
  categories: number;
  bands: Record<string, number>;
  technologies: TechnologyRow[];
};

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Four bins, chosen against the real distribution (max cell = 14). */
const BINS = [
  { max: 1, fill: "#184f95", ink: "#e2e8f0", label: "1" },
  { max: 4, fill: "#2a78d6", ink: "#e2e8f0", label: "2–4" },
  { max: 9, fill: "#5598e7", ink: "#070b14", label: "5–9" },
  { max: Infinity, fill: "#9ec5f4", ink: "#070b14", label: "10+" },
];

function binFor(count: number) {
  return BINS.find((b) => count <= b.max) ?? BINS[BINS.length - 1];
}

const BAND_META: Record<
  ReadinessBand,
  { label: string; fill: string; blurb: string }
> = {
  aligned: {
    label: "Aligned",
    fill: "#8f3a14",
    blurb: "manufacturing maturity matches what has been demonstrated",
  },
  lagging: {
    label: "Lagging",
    fill: "#cf5520",
    blurb: "production trails the demonstration by one level",
  },
  outrun: {
    label: "Outrun",
    fill: "#ef8a5c",
    blurb: "proven two or more levels faster than it can be built",
  },
};

export default function Readiness() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ trl: number; mrl: number } | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/technologies")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body as Payload;
      })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const t of data?.technologies ?? []) if (t.category) names.add(t.category);
    return [...names].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.technologies ?? []).filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.ref.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q) ||
        t.assessment_basis.toLowerCase().includes(q)
      );
    });
  }, [data, category, query]);

  /** Cell -> the technologies in it. The tooltip needs the names, not a count. */
  const cells = useMemo(() => {
    const m = new Map<string, TechnologyRow[]>();
    let unplaced = 0;
    for (const t of filtered) {
      if (t.trl === null || t.mrl === null) {
        unplaced += 1;
        continue;
      }
      const key = `${t.trl}:${t.mrl}`;
      const list = m.get(key);
      if (list) list.push(t);
      else m.set(key, [t]);
    }
    return { map: m, unplaced };
  }, [filtered]);

  const outrun = useMemo(
    () => filtered.filter((t) => t.band === "outrun"),
    [filtered],
  );

  if (error) {
    return (
      <div className="error">
        <strong>Could not load the readiness assessments.</strong>
        <p style={{ margin: "0.5rem 0 0" }}>{error}</p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          If this says the <code>space</code> domain is missing, the database
          has not had <code>009_domains_and_technology.sql</code> applied.
        </p>
      </div>
    );
  }

  if (!data) return <p className="muted">Loading assessments…</p>;

  const hovered = hover ? (cells.map.get(`${hover.trl}:${hover.mrl}`) ?? []) : [];
  const populated = cells.map.size;

  return (
    <div className="readiness">
      <div className="stats">
        <div className="stat">
          <b>{filtered.length}</b>
          <span>
            technolog{filtered.length === 1 ? "y" : "ies"}
            {filtered.length !== data.count ? ` of ${data.count}` : ""}
          </span>
        </div>
        <div className="stat">
          <b>{outrun.length}</b>
          <span>proven faster than they can be built</span>
        </div>
        <div className="stat">
          <b>
            {populated}
            <small>/81</small>
          </b>
          <span>grid cells with any assessment</span>
        </div>
      </div>

      <p className="caveat">
        <strong>These are curated assessments, not a census.</strong> All 69
        records sit at TRL&nbsp;4 or above, so this says nothing about
        emerging technology — an absence of evidence, not evidence of
        absence. The gap is only ever 0, +1 or +2, which is the shape of how
        these were judged rather than of the world, so it is shown as three
        bands and never as a scale.
      </p>

      <div className="controls">
        <label>
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All {categories.length} categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="name, ref or basis"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show matrix" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <TableView rows={filtered} />
      ) : (
        <>
          <figure className="matrix-figure">
            <figcaption>
              Demonstrated maturity against manufacturing maturity. Cells above
              the diagonal are technologies proven faster than they can be
              built.
            </figcaption>

            <div className="matrix" role="presentation">
              <div className="y-title">TRL — demonstrated</div>
              <div className="grid">
                {[...LEVELS].reverse().map((trl) => (
                  <div className="row" key={trl}>
                    <div className="tick">{trl}</div>
                    {LEVELS.map((mrl) => {
                      const list = cells.map.get(`${trl}:${mrl}`) ?? [];
                      const n = list.length;
                      const isHover = hover?.trl === trl && hover?.mrl === mrl;
                      return (
                        <div
                          key={mrl}
                          className={
                            "cell" +
                            (n ? " filled" : "") +
                            (trl === mrl ? " diag" : "") +
                            (isHover ? " hot" : "")
                          }
                          style={
                            n
                              ? {
                                  background: binFor(n).fill,
                                  // The ink flips with the step. Dark text
                                  // on the two dark steps is unreadable,
                                  // and a count nobody can read is the
                                  // same as no count.
                                  color: binFor(n).ink,
                                }
                              : undefined
                          }
                          onMouseEnter={() => setHover({ trl, mrl })}
                          onMouseLeave={() => setHover(null)}
                          title={
                            n
                              ? `TRL ${trl} / MRL ${mrl} — ${n}`
                              : `TRL ${trl} / MRL ${mrl} — none`
                          }
                        >
                          {n ? <span>{n}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="row axis">
                  <div className="tick" />
                  {LEVELS.map((mrl) => (
                    <div className="tick" key={mrl}>
                      {mrl}
                    </div>
                  ))}
                </div>
              </div>
              <div className="x-title">MRL — manufacturable</div>
            </div>

            <div className="ramp">
              <span className="ramp-label">technologies per cell</span>
              {BINS.map((b) => (
                <span className="ramp-step" key={b.label}>
                  <i style={{ background: b.fill }} />
                  {b.label}
                </span>
              ))}
            </div>
          </figure>

          <div className="detail" aria-live="polite">
            {hovered.length ? (
              <>
                <b>
                  TRL {hover?.trl} / MRL {hover?.mrl}
                </b>
                <ul>
                  {hovered.map((t) => (
                    <li key={t.ref}>
                      {t.name} <em>{t.category}</em>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="muted">
                Hover a cell to see which technologies are in it.
                {cells.unplaced
                  ? ` ${cells.unplaced} record(s) have no TRL or MRL and are not plotted.`
                  : ""}
              </span>
            )}
          </div>

          <h2>Proven faster than it can be built</h2>
          <p className="muted lead">
            {outrun.length} technolog{outrun.length === 1 ? "y" : "ies"} where
            TRL leads MRL by two or more — capability demonstrated, supply
            chain not caught up.
          </p>
          <ul className="gap-list">
            {outrun.map((t) => (
              <li key={t.ref}>
                <div className="gap-head">
                  <span className="name">{t.name}</span>
                  <Band band={t.band} />
                </div>
                <div className="gap-meta">
                  <span className="levels">
                    TRL {t.trl} · MRL {t.mrl}
                  </span>
                  <span>{t.category}</span>
                  <span className="basis" title="Assessment basis">
                    {t.assessment_basis}
                  </span>
                </div>
                {t.description ? <p>{t.description}</p> : null}
              </li>
            ))}
            {outrun.length === 0 ? (
              <li className="muted">Nothing in this filter has a gap of 2 or more.</li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The band chip. It carries its name in text, always.
 *
 * The standing rule from the assessment framework is that the tier travels
 * with the number all the way to the pixel — a derived level must never
 * render like an authoritative one. Every record here is tier B (curated),
 * so nothing on this page distinguishes tiers yet. When tier C arrives this
 * chip is where it gets said, and the component is shaped for that rather
 * than for one tier forever.
 */
function Band({ band }: { band: ReadinessBand | null }) {
  if (!band) return <span className="band unknown">Not assessed</span>;
  const meta = BAND_META[band];
  return (
    <span className="band" title={meta.blurb}>
      <i style={{ background: meta.fill }} />
      {meta.label}
    </span>
  );
}

/** Required, not optional: identity is never colour-alone and the numbers
 *  have to be readable without reading a picture. */
function TableView({ rows }: { rows: TechnologyRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Technology</th>
            <th>Category</th>
            <th className="num">TRL</th>
            <th className="num">MRL</th>
            <th className="num">Gap</th>
            <th>Band</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.ref}>
              <td className="ref">{t.ref}</td>
              <td>{t.name}</td>
              <td>{t.category}</td>
              <td className="num">{t.trl}</td>
              <td className="num">{t.mrl}</td>
              <td className="num">{t.readiness_gap}</td>
              <td>{t.band ? BAND_META[t.band].label : "—"}</td>
              <td>{t.assessment_basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
