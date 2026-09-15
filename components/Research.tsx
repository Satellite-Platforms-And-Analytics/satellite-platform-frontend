"use client";

/**
 * The R&D layer, on its own terms.
 *
 * WHAT THIS PAGE IS AN ANSWER TO
 * ==============================
 * The platform already reports what an organisation OPERATES (the
 * catalogue joined to GCAT by code) and what it PRODUCES (payloads per
 * year, 014). What it ADVANCES was not captured anywhere until 015, and
 * AD-084 made it the MVP's seventh piece.
 *
 * THE THING THIS PAGE MUST NOT DO
 * ===============================
 * Report one number as "the TRL of TX08". A project's `trlCurrent`
 * describes that project's funded work, and several projects on one
 * technology legitimately differ (AD-061). So maturity is drawn as a
 * RANGE with the mean marked inside it, never as a single figure — the
 * same restraint the readiness matrix applies when it bands its gaps
 * into three steps instead of gradienting them.
 *
 * COLOUR
 * ======
 * Two fills, reused verbatim from the organisations chart rather than
 * chosen fresh, so the app speaks one visual language. Validated against
 * this surface (#070b14) rather than assumed: worst adjacent pair ΔE
 * 26.8 under protanopia, 31.8 normal vision, both well past the ΔE 8
 * target, and both above 3:1 contrast. Identity is never colour-alone —
 * every segment carries a title, the legend is always present, and the
 * table below holds every exact value.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  AreaRow,
  PerformerRow,
  ResearchPayload,
} from "@/app/api/research/route";

/** Projects that state a TRL. The quantity being ranked. */
const WITH_TRL_FILL = "#3987e5";
/** Projects with no TRL stated — present, counted, and not maturity evidence. */
const NO_TRL_FILL = "#d95926";

/** 7% of the track is ~45px here: four digits and a separator. Below that
 *  a label clips mid-character, and a truncated number still reads as a
 *  number, which is worse than no number. */
const MIN_LABEL_PCT = 7;

function pct(n: number, of: number): number {
  return of > 0 ? Math.min(100, (n / of) * 100) : 0;
}

/**
 * TRL range, drawn on a fixed 1–9 scale.
 *
 * FIXED, AND THE SAME FOR EVERY ROW (AD-082). A range normalised per row
 * would make an area spanning TRL 2–3 look identical to one spanning
 * 1–9, which is the defect the organisations sparkline already had to
 * fix once.
 */
function TrlRange({ row }: { row: AreaRow }) {
  if (row.trl_min === null || row.trl_max === null) {
    return (
      <span className="trl-empty" title="no project in this area states a TRL">
        —
      </span>
    );
  }
  const lo = ((row.trl_min - 1) / 8) * 100;
  const hi = ((row.trl_max - 1) / 8) * 100;
  const mean = row.trl_mean === null ? null : ((row.trl_mean - 1) / 8) * 100;
  const label = `TRL ${row.trl_min}–${row.trl_max}` +
    (row.trl_mean === null ? "" : `, mean ${row.trl_mean}`) +
    ` across ${row.with_trl} of ${row.projects} projects`;
  return (
    <span className="trl-range" title={label} role="img" aria-label={label}>
      <span className="trl-axis" />
      <span
        className="trl-span"
        style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%` }}
      />
      {mean === null ? null : (
        <span className="trl-mean" style={{ left: `${mean}%` }} />
      )}
    </span>
  );
}

function year(d: string | null): string {
  return d ? d.slice(0, 4) : "—";
}

export default function Research() {
  const [data, setData] = useState<ResearchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/research")
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
        setData(body as ResearchPayload);
      })
      .catch((e) => live && setError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, []);

  const performers = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.performers.filter(
      (p) =>
        (!onlyLinked || p.operator_code) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [data, query, onlyLinked]);

  if (error) {
    return (
      <div className="error" role="alert">
        <strong>Could not load the R&amp;D layer.</strong> {error}
      </div>
    );
  }
  if (!data) return <p className="muted">Loading…</p>;

  const { areas, totals } = data;
  const widest = areas.reduce((m, a) => Math.max(m, a.projects), 0);

  return (
    <>
      <div className="stats">
        <div className="stat">
          <b>{totals.projects.toLocaleString()}</b>
          <span>classified projects</span>
        </div>
        <div className="stat">
          <b>{totals.performers.toLocaleString()}</b>
          <span>R&amp;D performers</span>
        </div>
        <div className="stat">
          <b>
            {totals.linked.toLocaleString()}
            <small>
              {" "}
              /{totals.performers.toLocaleString()}
            </small>
          </b>
          <span>also operate spacecraft</span>
        </div>
        <div className="stat">
          <b>
            {areas.length}
            <small> /17</small>
          </b>
          <span>TX areas with activity</span>
        </div>
      </div>

      <p className="caveat">
        <strong>{totals.linked} of {totals.performers} performers</strong> match an
        organisation in the operator catalogue. That is not a matching
        defect to be tuned away — TechPort names who does the research,
        GCAT names who flies the hardware, and most R&amp;D is done by
        centres, universities and firms that have never operated a
        spacecraft. The link is recorded where it exists and is never
        required for a row to appear.
      </p>

      <figure>
        <figcaption>
          Projects per NASA technology area. Bar length is the number of
          projects; the split separates those that state a technology
          readiness level from those that do not. A project without a TRL
          still says who is working on what.
        </figcaption>

        <div className="legend inline">
          <span>
            <i style={{ background: WITH_TRL_FILL }} /> states a TRL
          </span>
          <span>
            <i style={{ background: NO_TRL_FILL }} /> no TRL stated
          </span>
        </div>

        <div className="bars">
          {areas.map((a) => {
            const none = Math.max(0, a.projects - a.with_trl);
            const wPct = pct(a.with_trl, widest);
            const nPct = pct(none, widest);
            return (
              <div className="bar-row" key={a.code}>
                <div className="bar-label" title={a.title ?? a.code}>
                  {a.title ?? a.code}
                </div>
                <div className="bar-track">
                  {a.with_trl > 0 ? (
                    <div
                      className="seg pay"
                      style={{ width: `${wPct}%`, background: WITH_TRL_FILL }}
                      title={`${a.code}: ${a.with_trl.toLocaleString()} projects stating a TRL`}
                    >
                      {wPct >= MIN_LABEL_PCT ? (
                        <span>{a.with_trl.toLocaleString()}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {none > 0 ? (
                    <div
                      className="seg oth"
                      style={{ width: `${nPct}%`, background: NO_TRL_FILL }}
                      title={`${a.code}: ${none.toLocaleString()} projects with no TRL stated`}
                    >
                      {nPct >= MIN_LABEL_PCT ? (
                        <span>{none.toLocaleString()}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </figure>

      <div className="table-wrap">
        <table>
          <caption className="muted">
            Maturity is a <strong>range</strong>, never one number. A
            project&rsquo;s TRL describes that project&rsquo;s funded work, and
            several projects in one area legitimately differ — so the bar
            spans lowest to highest on a fixed 1–9 scale, with the mean
            marked inside it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Area</th>
              <th scope="col" className="num">Projects</th>
              <th scope="col" className="num">Performers</th>
              <th scope="col" className="num">With TRL</th>
              <th scope="col">TRL range (1–9)</th>
              <th scope="col" className="num">Low</th>
              <th scope="col" className="num">Mean</th>
              <th scope="col" className="num">High</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.code}>
                <th scope="row">
                  <span className="ref">{a.code}</span>{" "}
                  {a.title ?? <em className="muted">unnamed</em>}
                </th>
                <td className="num">{a.projects.toLocaleString()}</td>
                <td className="num">{a.performers.toLocaleString()}</td>
                <td className="num">{a.with_trl.toLocaleString()}</td>
                <td>
                  <TrlRange row={a} />
                </td>
                <td className="num">{a.trl_min ?? "—"}</td>
                <td className="num">{a.trl_mean ?? "—"}</td>
                <td className="num">{a.trl_max ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="controls">
        <label>
          <span>Find a performer</span>
          <input
            type="search"
            value={query}
            placeholder="Goddard, Tendeg, Caltech…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyLinked}
            onChange={(e) => setOnlyLinked(e.target.checked)}
          />
          <span>Only those that also operate spacecraft</span>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <caption className="muted">
            {performers.length.toLocaleString()} of{" "}
            {data.performers.length.toLocaleString()} performers.{" "}
            <strong>Operator</strong> is an attribute, not a requirement: a
            blank means TechPort names an organisation the catalogue has no
            reason to know, which is the ordinary case.
          </caption>
          <thead>
            <tr>
              <th scope="col">Performer</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">Projects</th>
              <th scope="col" className="num">With TRL</th>
              <th scope="col" className="num">Highest TRL</th>
              <th scope="col">Operator</th>
              <th scope="col" className="num">Latest</th>
            </tr>
          </thead>
          <tbody>
            {performers.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <td className="muted">{p.org_type ?? "—"}</td>
                <td className="num">{p.projects.toLocaleString()}</td>
                <td className="num">{p.with_trl.toLocaleString()}</td>
                <td className="num">{p.trl_max ?? "—"}</td>
                <td>
                  {p.operator_code ? (
                    <>
                      <span className="ref">{p.operator_code}</span>
                      {p.match_method === "agency_prefix_stripped" ? (
                        <span
                          className="muted loose"
                          title="matched only after dropping a leading agency name — a looser rule, recorded as such"
                        >
                          {" "}
                          loose
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="num">{year(p.most_recent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
