import Readiness from "@/components/Readiness";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Technology readiness — Satellite Platform",
  description:
    "Curated TRL and MRL assessments across the human space domain, and " +
    "the technologies proven faster than they can be built.",
};

export default function ReadinessPage() {
  return (
    <main>
      <Nav current="readiness" />
      <header>
        <h1>Technology readiness</h1>
        <p>
          Curated TRL and MRL assessments across the human space domain —
          launch propulsion through hypersonics, not only satellites.
        </p>
      </header>

      <Readiness />

      <footer>
        <p>
          69 curated assessments · every one carries a stated basis ·
          readiness gap computed in the database, not by hand
        </p>
      </footer>
    </main>
  );
}
