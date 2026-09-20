"use client";

/**
 * Upcoming launches — and the difference between a schedule and a list.
 *
 * THE ONE THING THIS PAGE MUST NOT DO
 * ===================================
 * Let a reader come away believing there are 363 scheduled launches.
 *
 * Twenty are known to a day or better. 181 are known only to the YEAR
 * and 35 only to the DECADE, and 348 of 363 carry the status "To Be
 * Determined". Rendering those alike would put a decade-precision guess
 * in the same column as a launch happening on Thursday — the same
 * category error AD-061 caught when a per-project TRL was about to
 * become a technology's, and AD-082 caught when a sparkline's axis
 * changed per row.
 *
 * So the split is structural, not a filter: two sections, two headings,
 * and the approximate rows NEVER render a timestamp. "2027" and "Q4
 * 2026" are text, because that is what the source actually knows.
 *
 * The tier comes from `net_confidence`, a GENERATED column in 020. This
 * component does not recompute it from `net_precision` — that would put
 * the decision in a second place, and two places can disagree.
 *
 * COLOUR
 * ======
 * The two categorical fills are the app's existing pair, validated
 * against this surface (#070b14): worst adjacent ΔE 26.8 protan, 31.8
 * normal, both above 3:1 contrast. "Undated" uses the muted ink token
 * deliberately — it is an ABSENCE, not a third category, and giving it a
 * hue would imply it belongs on the same axis as the other two. Identity
 * is never colour-alone: the legend is always present and every segment
 * carries a title.
 */
import { useEffect, useMemo, useState } from "react";
import type { LaunchRow, LaunchesPayload } from "@/app/api/launches/route";

const DATED_FILL = "#3987e5";
const APPROX_FILL = "#d95926";

/**
 * A launch time, rendered at the precision the source actually claims.
 *
 * THE FUNCTION THIS PAGE EXISTS FOR. A `dated` row gets a real
 * date-time. Everything else gets the source's own words — the year, the
 * quarter, the decade — and never a timestamp a reader could mistake for
 * a schedule.
 */
function when(l: LaunchRow): string {
  if (!l.net) return "no date";
  const d = new Date(l.net);
  if (Number.isNaN(d.getTime())) return "no date";

  if (l.net_confidence === "dated") {
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      timeZoneName: "short",
    });
  }

  const y = d.getUTCFullYear();
  const p = l.net_precision ?? "";
  if (p === "Decade") return `${Math.floor(y / 10) * 10}s`;
  if (p.startsWith("Quarter")) return `${p.replace("Quarter ", "Q")} ${y}`;
  if (p === "Year Half 1") return `first half of ${y}`;
  if (p === "Year Half 2") return `second half of ${y}`;
  if (p === "Fiscal Year") return `FY ${y}`;
  if (p === "Month") {
    return d.toLocaleString(undefined,
      { year: "numeric", month: "long", timeZone: "UTC" });
  }
  return `${y}`;
}

function Segment({
  n, total, fill, label, muted,
}: {
  n: number; total: number; fill?: string; label: string; muted?: boolean;
}) {
  if (!n) return null;
  const pct = (n / Math.max(1, total)) * 100;
  return (
    <div
      className={muted ? "seg none" : "seg"}
      style={{ width: `${pct}%`, background: fill }}
      title={`${n} ${label} (${pct.toFixed(0)}%)`}
    >
      {pct >= 7 ? <span>{n}</span> : null}
    </div>
  );
}

export default function Launches() {
  const [data, setData] = useState<LaunchesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/launches")
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
        setData(body as LaunchesPayload);
      })
      .catch((e) => live && setError(String(e.message ?? e)));
    return () => { live = false; };
  }, []);

  const { scheduled, manifested } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (l: LaunchRow) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.provider_name ?? "").toLowerCase().includes(q) ||
      (l.mission ?? "").toLowerCase().includes(q);
    const all = (data?.launches ?? []).filter(hit);
    return {
      scheduled: all.filter((l) => l.net_confidence === "dated"),
      manifested: all.filter((l) => l.net_confidence !== "dated"),
    };
  }, [data, query]);

  if (error) {
    return (
      <div className="error" role="alert">
        <strong>Could not load the launch manifest.</strong> {error}
      </div>
    );
  }
  if (!data) return <p className="muted">Loading…</p>;

  const { totals } = data;

  return (
    <>
      <div className="stats">
        <div className="stat">
          <b>{totals.dated}</b>
          <span>actually scheduled</span>
        </div>
        <div className="stat">
          <b>{totals.approximate + totals.undated}</b>
          <span>listed, not scheduled</span>
        </div>
        <div className="stat">
          <b>{totals.providers}</b>
          <span>launch providers</span>
        </div>
        <div className="stat">
          <b>
            {totals.linked}
            <small> /{totals.all}</small>
          </b>
          <span>linked to an operator</span>
        </div>
      </div>

      <p className="caveat">
        <strong>This is a manifest, not a schedule.</strong> Of{" "}
        {totals.all} upcoming launches, <strong>{totals.dated}</strong> are
        known to a day or better. The rest are dated to the month, the
        quarter, the year — and {" "}
        {data.launches.filter((l) => l.net_precision === "Decade").length}{" "}
        only to the decade. Those are shown in the source&rsquo;s own words
        rather than as a timestamp, because a guess rendered as a date is
        read as a fact.
      </p>

      <figure>
        <figcaption>
          How well the time is known, across the whole manifest.
        </figcaption>
        <div className="legend inline">
          <span><i style={{ background: DATED_FILL }} /> day or finer</span>
          <span><i style={{ background: APPROX_FILL }} /> month or coarser</span>
          <span><i className="none" /> no date at all</span>
        </div>
        <div className="bars">
          <div className="bar-row">
            <div className="bar-label">{totals.all} launches</div>
            <div className="bar-track">
              <Segment n={totals.dated} total={totals.all}
                       fill={DATED_FILL} label="known to a day or better" />
              <Segment n={totals.approximate} total={totals.all}
                       fill={APPROX_FILL} label="known to a month or coarser" />
              <Segment n={totals.undated} total={totals.all}
                       label="with no date at all" muted />
            </div>
          </div>
        </div>
      </figure>

      <div className="controls">
        <label>
          <span>Find a launch, mission or provider</span>
          <input
            type="search" value={query} placeholder="Starship, Sentinel, Rocket Lab…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <h2>Scheduled <span className="muted">— {scheduled.length}</span></h2>
      <p className="muted">
        Known to a day or better, so the time is shown as a time.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">When (UTC)</th>
              <th scope="col">Launch</th>
              <th scope="col">Provider</th>
              <th scope="col">Mission</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length === 0 ? (
              <tr><td colSpan={5} className="muted">
                Nothing in this window is dated to a day or better.
              </td></tr>
            ) : scheduled.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="num">{when(l)}</th>
                <td>{l.name}</td>
                <td>
                  {l.provider_name ?? <span className="muted">—</span>}
                  {l.provider_code ? (
                    <> <span className="ref">{l.provider_code}</span></>
                  ) : null}
                </td>
                <td className="muted">{l.mission ?? "—"}</td>
                <td className="muted">{l.status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Manifested <span className="muted">— {manifested.length}</span></h2>
      <p className="muted">
        Listed, with no date anyone could plan around.{" "}
        <strong>The first column is not a date</strong> — it is the
        precision the source itself claims.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Expected</th>
              <th scope="col">Precision</th>
              <th scope="col">Launch</th>
              <th scope="col">Provider</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {manifested.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="approx">{when(l)}</th>
                <td className="muted">{l.net_precision ?? "none"}</td>
                <td>{l.name}</td>
                <td>
                  {l.provider_name ?? <span className="muted">—</span>}
                  {l.provider_code ? (
                    <> <span className="ref">{l.provider_code}</span></>
                  ) : null}
                </td>
                <td className="muted">{l.status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="caveat">
        <strong>A blank provider is not a gap.</strong> United Launch
        Alliance and China Aerospace Science and Technology Corporation are
        recorded refusals, not misses: GCAT has no single row meaning
        &ldquo;ULA the launch provider&rdquo;, and the nearest row to CASC
        is CASIC — a different company. Both decisions are in{" "}
        <code>data/seed/org_aliases.tsv</code> with their reasoning.
      </p>
    </>
  );
}
