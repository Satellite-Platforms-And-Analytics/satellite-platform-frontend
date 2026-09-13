"use client";

/**
 * An orthographic globe with live satellite positions.
 *
 * Canvas, not SVG. 1,500 satellites is 1,500 DOM nodes per frame in SVG,
 * which React and the browser both hate; a canvas redraw is one operation
 * regardless of count. d3-geo supplies the projection maths either way -
 * only the renderer differs.
 *
 * Positions come from satellite.js running SGP4 in this browser, from the
 * element sets /api/tles returns. See that route for why.
 */
import {
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import { useEffect, useRef, useState } from "react";
import * as satellite from "satellite.js";
import { feature } from "topojson-client";

type TleRow = {
  norad_id: number;
  name: string;
  line1: string;
  line2: string;
  orbit_regime: string | null;
};

type Tracked = {
  norad_id: number;
  name: string;
  regime: string | null;
  satrec: satellite.SatRec;
};

const REGIME_COLOR: Record<string, string> = {
  LEO: "#4ade80",
  MEO: "#60a5fa",
  GEO: "#f472b6",
  HEO: "#fbbf24",
};
const DEFAULT_COLOR = "#94a3b8";

/**
 * Land outlines, code-split and served from our own origin.
 *
 * SECURITY: this used to be
 * `fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json")` -
 * a runtime request to a third party, on a floating major version, with
 * no integrity check. The parsed result was fed straight to topojson and
 * drawn, so the blast radius was bounded (no script execution), but it
 * made the page's behaviour depend on a host nobody here controls, and it
 * meant `connect-src` could never be `'self'` - a content security policy
 * that has to allow an arbitrary CDN is most of the way to no policy.
 *
 * `world-atlas@2.0.2` is now a dependency: pinned in package-lock.json
 * with an integrity hash, resolved at install time where it can be
 * audited, and shipped from the same origin as everything else. The
 * dynamic import keeps it out of the initial bundle, so the globe still
 * paints before the coastlines arrive and still works if they never do.
 *
 * Changed 2026-09-13.
 */

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [land, setLand] = useState<any | null>(null);
  const [status, setStatus] = useState("Loading element sets…");
  const [error, setError] = useState<string | null>(null);

  // Rotation is a ref, not state: it changes every frame, and putting it in
  // state would re-render React 60 times a second to draw on a canvas React
  // does not manage anyway.
  const rotation = useRef<[number, number]>([0, -15]);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const spinning = useRef(true);

  // ── Load element sets ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tles");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (cancelled) return;

        const rows: TleRow[] = body.satellites ?? [];
        const parsed: Tracked[] = [];
        let rejected = 0;

        for (const r of rows) {
          try {
            const satrec = satellite.twoline2satrec(r.line1, r.line2);
            // satellite.js reports parse failure through a field rather
            // than an exception, so an unchecked satrec silently produces
            // NaN positions that vanish from the globe with no clue why.
            if ((satrec as any).error) {
              rejected++;
              continue;
            }
            parsed.push({
              norad_id: r.norad_id,
              name: r.name,
              regime: r.orbit_regime,
              satrec,
            });
          } catch {
            rejected++;
          }
        }

        setTracked(parsed);
        setStatus(
          (body.sampled
            ? `${parsed.length.toLocaleString()} of ` +
              `${Number(body.total).toLocaleString()} objects`
            : `${parsed.length.toLocaleString()} objects`) +
            (rejected ? ` · ${rejected} unparseable` : ""),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Land outlines, best effort ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    import("world-atlas/land-110m.json")
      .then((mod) => {
        const topo = (mod as { default: any }).default ?? mod;
        if (!cancelled) setLand(feature(topo, topo.objects.land));
      })
      .catch(() => {
        /* graticule-only globe is still a globe */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Draw loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const graticule = geoGraticule10();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = Math.min(
        canvas.parentElement?.clientWidth ?? 640,
        window.innerHeight - 180,
      );
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return size;
    };

    let size = resize();
    window.addEventListener("resize", () => {
      size = resize();
    });

    const draw = () => {
      const projection: GeoProjection = geoOrthographic()
        .scale(size / 2 - 6)
        .translate([size / 2, size / 2])
        .rotate([rotation.current[0], rotation.current[1]]);

      const path = geoPath(projection, ctx);

      ctx.clearRect(0, 0, size, size);

      // Ocean
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = "#0b1220";
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Graticule
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Land
      if (land) {
        ctx.beginPath();
        path(land);
        ctx.fillStyle = "#1e3a3a";
        ctx.fill();
        ctx.strokeStyle = "rgba(148,163,184,0.35)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Satellites
      const now = new Date();
      const gmst = satellite.gstime(now);
      // A projection rotated by [λ, φ] is looking at [-λ, -φ].
      const center: [number, number] = [
        -rotation.current[0],
        -rotation.current[1],
      ];

      for (const t of tracked) {
        const pv = satellite.propagate(t.satrec, now);
        const eci = pv?.position;
        if (!eci || typeof eci === "boolean") continue;

        const geo = satellite.eciToGeodetic(eci, gmst);
        const lon = satellite.degreesLong(geo.longitude);
        const lat = satellite.degreesLat(geo.latitude);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        // Hide the far hemisphere. clipAngle(90) applies to the path
        // stream, not to calling the projection on a single point - that
        // still returns coordinates for objects behind the globe, mirrored
        // through the centre, so every satellite would appear twice.
        // Compare against the point the projection is centred on instead.
        if (geoDistance([lon, lat], center) > Math.PI / 2) continue;

        const p = projection([lon, lat]);
        if (!p) continue;
        const [x, y] = p;

        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, 2 * Math.PI);
        ctx.fillStyle = t.regime
          ? (REGIME_COLOR[t.regime] ?? DEFAULT_COLOR)
          : DEFAULT_COLOR;
        ctx.fill();
      }

      if (spinning.current && !dragging.current) {
        rotation.current[0] = (rotation.current[0] + 0.12) % 360;
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [tracked, land]);

  // ── Drag to rotate ───────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragging.current;
    if (!start) return;
    rotation.current[0] += (e.clientX - start.x) * 0.4;
    rotation.current[1] = Math.max(
      -90,
      Math.min(90, rotation.current[1] - (e.clientY - start.y) * 0.4),
    );
    dragging.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  return (
    <div className="globe">
      {error ? (
        <p className="error">
          <strong>Could not load element sets.</strong>
          <br />
          {error}
        </p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="legend">
            <span className="status">{status}</span>
            {Object.entries(REGIME_COLOR).map(([regime, color]) => (
              <span key={regime}>
                <i style={{ background: color }} />
                {regime}
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                spinning.current = !spinning.current;
              }}
            >
              spin on/off
            </button>
          </div>
        </>
      )}
    </div>
  );
}
