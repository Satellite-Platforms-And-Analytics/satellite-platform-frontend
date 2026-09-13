import Link from "next/link";

/**
 * Added 2026-09-13. The app had no navigation because until the readiness
 * views existed there was nowhere to go — one page, one component, one
 * route. That is the imbalance the 09-12 direction change was called to
 * fix, and this file is the smallest possible admission of it.
 */
const LINKS = [
  { key: "globe", href: "/", label: "Globe" },
  { key: "readiness", href: "/readiness", label: "Readiness" },
];

export default function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className={l.key === current ? "active" : undefined}
          aria-current={l.key === current ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
