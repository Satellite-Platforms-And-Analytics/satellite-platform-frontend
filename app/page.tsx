import Globe from "@/components/Globe";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Satellite Platform</h1>
        <p>
          Live positions, propagated in your browser from element sets
          ingested every two hours. Drag to rotate.
        </p>
      </header>

      <Globe />

      <footer>
        <p>
          SGP4 via satellite.js · orthographic projection via d3-geo ·
          element sets from CelesTrak
        </p>
      </footer>
    </main>
  );
}
