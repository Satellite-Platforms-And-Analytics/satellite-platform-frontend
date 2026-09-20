import Launches from "@/components/Launches";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Upcoming launches — Satellite Platform",
  description:
    "What is actually scheduled, and what is only listed: the Launch " +
    "Library 2 manifest, shown at the precision the source claims.",
};

export default function LaunchesPage() {
  return (
    <main className="wide">
      <Nav current="launches" />
      <header>
        <h1>Upcoming launches</h1>
        <p>
          The other half of &ldquo;objects launched and upcoming&rdquo;.
          Shown at the precision the source actually claims — because most
          of this manifest is not a schedule, and a page that hides that
          is worse than no page.
        </p>
      </header>

      <Launches />

      <footer>
        <p>
          Source: <a href="https://thespacedevs.com/llapi">Launch Library 2
          / theSpaceDevs</a> · free tier, 15 requests/hour, cached ·
          no licence is published, which is a reason to credit rather than
          a reason not to
        </p>
      </footer>
    </main>
  );
}
