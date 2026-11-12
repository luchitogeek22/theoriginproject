import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE ORIGIN PROJECT — Explore the universe. Understand its changes.",
  description:
    "Interactive observatory over real NASA SPHEREx observations: explore the sky, travel through time, and understand the evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
