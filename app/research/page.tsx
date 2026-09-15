import Research from "@/components/Research";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Research & Development — Satellite Platform",
  description:
    "Who is advancing which technologies, and at what maturity: NASA " +
    "TechPort projects by technology area and performer.",
};

export default function ResearchPage() {
  return (
    // Wide, like /organisations: the area table carries eight columns
    // including a fixed 1-9 TRL range, and at 900px the maturity
    // evidence -- the reason the table exists -- sits behind a scrollbar.
    <main className="wide">
      <Nav current="research" />
      <header>
        <h1>Research &amp; development</h1>
        <p>
          What organisations <em>advance</em>, which the catalogue could not
          say. NASA TechPort projects by technology area and performer —
          a different population from the operators who fly the hardware,
          and read on its own terms.
        </p>
      </header>

      <Research />

      <footer>
        <p>
          Source: <a href="https://techport.nasa.gov">NASA TechPort</a> ·
          NASA content is not subject to US copyright; acknowledgement is
          required rather than permission · taxonomy areas and titles are
          NASA&rsquo;s own, read from the record rather than transcribed
        </p>
      </footer>
    </main>
  );
}
