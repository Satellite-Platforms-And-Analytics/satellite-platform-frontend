import Organizations from "@/components/Organizations";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Organisations — Satellite Platform",
  description:
    "Who operates what: organisations joined to the catalogue by an exact " +
    "code, with payloads separated from stages and debris.",
};

export default function OrganizationsPage() {
  return (
    // Wider than the 900px the reading pages use. This table carries ten
    // columns including a 24-year sparkline, and at 900px the production
    // evidence -- the reason the table was extended at all -- sat past the
    // right edge behind a horizontal scrollbar nobody would find.
    <main className="wide">
      <Nav current="organizations" />
      <header>
        <h1>Organisations</h1>
        <p>
          4,108 organisations from GCAT, joined to the catalogue by code
          rather than by name — so the count is what an organisation
          actually flew.
        </p>
      </header>

      <Organizations />

      <footer>
        <p>
          organisations from GCAT · joined on `operator_code` ·
          payloads counted separately from stages and debris
        </p>
      </footer>
    </main>
  );
}
