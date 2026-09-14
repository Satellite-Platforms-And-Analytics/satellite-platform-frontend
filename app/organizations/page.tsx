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
    <main>
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
