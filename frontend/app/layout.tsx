import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Tutorial from "@/components/Tutorial";
import ModeToggle from "@/components/ModeToggle";
import { ResearchProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "THE ORIGIN PROJECT — Explore the universe. Understand its changes.",
  description:
    "Interactive observatory over real NASA SPHEREx observations: explore the sky, travel through time, and understand the evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ResearchProvider>
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-line bg-deep/60 px-3 py-1.5">
                <p className="text-[11px] text-mutedstar md:hidden">THE ORIGIN PROJECT</p>
                <p className="hidden text-[11px] text-mutedstar md:block">
                  Observatorio interactivo · datos SPHEREx (NASA/IPAC IRSA)
                </p>
                <ModeToggle />
              </header>
              <main className="min-h-0 flex-1">{children}</main>
            </div>
          </div>
          <Tutorial />
        </ResearchProvider>
      </body>
    </html>
  );
}
