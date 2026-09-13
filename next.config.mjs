/**
 * SECURITY HEADERS
 * ================
 * Added 2026-09-13. Before this the app shipped no security headers at
 * all: no content security policy, no `nosniff`, no referrer policy, and
 * nothing preventing the page being framed. None of that was a live
 * vulnerability -- the app takes no user input, writes nothing, and holds
 * no session -- but "there is nothing to steal yet" is a property of
 * today's feature set, not of the code, and it stops being true the first
 * time this platform shows anything a user can act on.
 *
 * `connect-src 'self'` is only honest because the world-atlas land
 * geometry stopped being fetched from jsdelivr on the same day (see
 * components/Globe.tsx). A policy that has to allow an arbitrary CDN is
 * most of the way to no policy.
 *
 * KNOWN WEAKNESS, STATED RATHER THAN HIDDEN
 * =========================================
 * `script-src` and `style-src` both carry `'unsafe-inline'`, because Next
 * emits inline bootstrap scripts and inline styles. The strict fix is
 * per-request nonces from middleware, which forces every page to render
 * dynamically -- it trades the static rendering of `/` and `/readiness`
 * for it. That trade is worth making when this app has a login or accepts
 * input; it is not worth making today, and the point of writing it down
 * here is that the choice stays visible instead of looking like an
 * oversight. Recorded in the security baseline.
 *
 * What the policy still buys with `'unsafe-inline'` present: no external
 * script host, no external connection, no framing, no plugin content, no
 * base-tag rewriting, and no form posting off-origin. Those are the paths
 * an injected string would need to actually exfiltrate anything.
 */

/**
 * `next dev` runs React Refresh, which uses `eval`. A policy without
 * `'unsafe-eval'` therefore breaks the development server outright --
 * blank page, a console full of 500s, and a cause that looks nothing like
 * its origin. Found by rendering the page after adding these headers
 * rather than by shipping them; the production bundle needs no eval, so
 * the relaxation is scoped to development and never reaches the deploy.
 */
const DEV = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Stops a response being re-interpreted as a type it did not declare --
  // the mechanism behind "it was served as JSON and executed as script".
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy sibling of frame-ancestors, for browsers that predate CSP 2.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs any of these. Denying them now means a future
  // dependency cannot quietly start asking.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Vercel sets HSTS on its domains; declaring it keeps the behaviour
  // attached to the application rather than to where it happens to run.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // no free version disclosure
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
