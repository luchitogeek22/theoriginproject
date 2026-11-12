import Sidebar from "@/components/Sidebar";
import Tutorial from "@/components/Tutorial";
import ModeToggle from "@/components/ModeToggle";
import { ResearchProvider } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
