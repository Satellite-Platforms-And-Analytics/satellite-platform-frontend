import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Satellite Platform",
  description:
    "Live satellite positions, propagated client-side from element sets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
