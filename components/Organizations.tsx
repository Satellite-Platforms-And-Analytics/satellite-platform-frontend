"use client";

/**
 * Who has flown what.
 *
 * WHAT THIS PAGE IS CAREFUL ABOUT
 * ===============================
 * Two counts, not one. `objects` is everything an organisation has in the
 * catalogue; `payloads` is what it operates. A rocket body is something
 * you launched, not something you built to fly, and a chart ranked on
 * `objects` alone rewards whoever left the most debris in orbit. That is
 * a real fact about the world and not the one this page is about, so the
 * default ranking is payloads and both numbers are always shown.
 *
 * The list is the top 200 of a long thin tail — about 90% of catalogued
 * objects belong to some 63 organisations. The page says so rather than
 * letting a truncated list read as a census, which is the same rule the
 * readiness matrix follows by drawing all 81 cells.
 *
 * COLOUR
 * ======
 * Two series, two hues, validated against this app's own surface
 * (#070b14): payloads #3987e5, other objects #d95926. Worst-pair CVD ΔE
 * 26.8 and normal-vision 31.8, both far clear of the floors. Each bar
 * segment also carries its number in text, so nothing is encoded by
 * colour alone.
 */
import { useEffect, useMemo, useState } from "react";
import type { OrganizationRow } from "@/app/api/organizations/route";

type Payload = {
  count: number;
  limit: number;
  totals: { objects: number; payloads: number; scope: string };
  organizations: OrganizationRow[];
};

const PAYLOAD_FILL = "#3987e5";
const OTHER_FILL = "#d95926";
const CHART_ROWS = 15;

/** GCAT's role letters, expanded. Compound values keep every part. */
const ROLE: Record<string, string> = {
  O: "operator",
  PL: "payload builder",
  LV: "launch vehicle",
  LA: "launch agency",
  S: "site",
  E: "engine",
  LS: "launch site",
  CY: "country",
  CYP: "former country",
  W: "weapon",
  IGO: "intergovernmental",
  P: "other",
};

function roles(t: string | null): string {
  if (!t) return "—";
  return t
    .split("/")
    .map((p) => ROLE[p] ?? p)
    .join(" · ");
}

function year(d: string | null): string {
  return d ? d.slice(0, 4) : "—";
}

export default function Organizations() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"payloads" | "objects">("payloads");

  useEffect(() => {
    let live = true;
    fetch("/api/organizations")
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.organizations ?? []).filter(
      (o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.short ?? "").toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        (o.state_code ?? "").toLowerCase().includes(q),
    );
    return [...list].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [data, query, sortBy]);

  const chart = rows.slice(0, CHART_ROWS);

  // THE BAR SHOWS WHAT YOU RANKED BY.
  //
  // The first version ranked by payloads and scaled every bar to the
  // largest OBJECT count, so the metric the ranking was about became
  // invisible: Planet at 658 payloads and Kuiper at 598 drew as slivers
  // because SpaceX's 13,193 objects set the scale. A chart whose ordering
  // variable and length variable disagree does not illustrate the
  // ranking, it contradicts it.
  //
  // Ranked by payloads: one series, length is payloads, and the debris is
  // a trailing figure in text. Ranked by objects: the stack, because then
  // the total IS the ranked quantity and the split is the interesting
  // part of it.
  const stacked = sortBy === "objects";
  const widest = chart.length
    ? Math.max(...chart.map((o) => (stacked ? o.objects : o.payloads)), 1)
    : 1;

  if (error) {
    return (
      <div className="error">
        <strong>Could not load organisations.</strong>
        <p style={{ margin: "0.5rem 0 0" }}>{error}</p>
      </div>
    );
  }
  if (!data) return <p className="muted">Loading organisations…</p>;

  return (
    <div className="readiness orgs">
      <div className="stats">
        <div className="stat">
          <b>{rows.length}</b>
          <span>
            organisation{rows.length === 1 ? "" : "s"}
            {rows.length !== data.count ? ` of ${data.count}` : ""}
          </span>
        </div>
        <div className="stat">
          <b>{data.totals.payloads.toLocaleString()}</b>
          <span>payloads operated</span>
        </div>
        <div className="stat">
          <b>{data.totals.objects.toLocaleString()}</b>
          <span>objects including stages and debris</span>
        </div>
      </div>

      <p className="caveat">
        <strong>The top {data.count} of a long, thin tail.</strong> About
        90% of catalogued objects belong to roughly 63 organisations; the
        rest have a handful each. These totals cover the organisations
        shown, not the catalogue — and the catalogue itself holds about
        17,500 of GCAT&rsquo;s ~70,000 objects, so an organisation missing
        here may simply operate nothing we track.
      </p>

      <div className="controls">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="name, code or state"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span>Rank by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "payloads" | "objects")}
          >
            <option value="payloads">Payloads operated</option>
            <option value="objects">All objects</option>
          </select>
        </label>
      </div>

      <figure className="matrix-figure">
        <figcaption>
          Top {chart.length} by {stacked ? "all objects" : "payloads"}.{" "}
          {stacked
            ? "Each bar splits what an organisation operates from what it merely put up — a rocket body is something you launched, not something you built to fly."
            : "Bar length is payloads, the quantity being ranked. The trailing figure is stages, debris and other objects, which are launched rather than operated."}
        </figcaption>

        <div className="bars">
          {chart.map((o) => {
            const other = Math.max(0, o.objects - o.payloads);
            const payPct = Math.min(100, (o.payloads / widest) * 100);
            const othPct = Math.min(100, (other / widest) * 100);
            // A number is drawn only when its segment can hold it.
            //
            // The first render clipped digits mid-character: "1,205"
            // became "0 5", "698" became "98", "212" became "2". A
            // truncated number is worse than no number, because it still
            // reads as a number. The table below carries every exact
            // value, so dropping the label costs nothing.
            //
            // 7% of the track is about 45px at the width this chart is
            // drawn at, which fits four digits and a separator.
            const MIN_LABEL_PCT = 7;
            return (
              <div className="bar-row" key={o.code}>
                <div className="bar-label" title={o.name}>
                  {o.short || o.name}
                </div>
                <div className="bar-track">
                  {o.payloads > 0 ? (
                    <div
                      className="seg pay"
                      style={{ width: `${payPct}%`, background: PAYLOAD_FILL }}
                      title={`${o.payloads.toLocaleString()} payloads`}
                    >
                      {payPct >= MIN_LABEL_PCT ? (
                        <span>{o.payloads.toLocaleString()}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {stacked && other > 0 ? (
                    <div
                      className="seg oth"
                      style={{ width: `${othPct}%`, background: OTHER_FILL }}
                      title={`${other.toLocaleString()} stages, debris and other`}
                    >
                      {othPct >= MIN_LABEL_PCT ? (
                        <span>{other.toLocaleString()}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {!stacked ? (
                    // The ranked number comes FIRST and is always shown.
                    //
                    // When the bar is too short to hold its own label the
                    // only visible figure was the trailing "+348" — so PVO
                    // read as 348 when its payload count is 815, and the
                    // one number on screen was the one the chart is not
                    // ranking by. A bar too small to label still has to
                    // say what it is.
                    <span className="trailing">
                      {payPct < MIN_LABEL_PCT ? (
                        <b title="payloads operated">
                          {o.payloads.toLocaleString()}
                        </b>
                      ) : null}
                      {other > 0 ? (
                        <em title="stages, debris and other">
                          +{other.toLocaleString()}
                        </em>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* A single series needs no legend -- the caption names it. The
            legend appears only for the stacked view, where two colours
            are actually on screen. */}
        {stacked ? (
          <div className="ramp">
            <span className="ramp-label">objects</span>
            <span className="ramp-step">
              <i style={{ background: PAYLOAD_FILL }} />
              payloads operated
            </span>
            <span className="ramp-step">
              <i style={{ background: OTHER_FILL }} />
              stages, debris and other
            </span>
          </div>
        ) : null}
      </figure>

      {/* Not "every organisation": the route returns the top 200 of
          4,108, and a heading that says otherwise is the same
          overclaiming the caveat above exists to prevent. */}
      <h2>
        Top {data.count} organisations
        {query ? ` — ${rows.length} matching “${query}”` : ""}
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Organisation</th>
              <th>Role</th>
              <th>State</th>
              <th className="num">Payloads</th>
              <th className="num">Objects</th>
              <th className="num">First</th>
              <th className="num">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.code}>
                <td className="ref">{o.code}</td>
                <td>{o.name}</td>
                <td className="role">{roles(o.org_type)}</td>
                <td className="ref">{o.state_code ?? "—"}</td>
                <td className="num">{o.payloads.toLocaleString()}</td>
                <td className="num">{o.objects.toLocaleString()}</td>
                <td className="num">{year(o.first_flight)}</td>
                <td className="num">{year(o.last_flight)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  Nothing matches that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
