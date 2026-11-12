import { getTranslations } from "next-intl/server";
import HideInEmbed from "@/components/HideInEmbed";
import LanguageSwitcher from "@/components/language-switcher/LanguageSwitcher";
import Sidebar from "@/components/Sidebar";
import Tutorial from "@/components/Tutorial";
import ModeToggle from "@/components/ModeToggle";
import { ResearchProvider } from "@/lib/store";

/** Structural shell only; every route under it (observatory, candidates, …) has its own
 * layout.tsx attaching translated metadata via `metadataFor`. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <ResearchProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <HideInEmbed>
          <Sidebar />
        </HideInEmbed>
        <div className="flex min-w-0 flex-1 flex-col">
          <HideInEmbed>
            <header className="flex items-center justify-between gap-2 border-b border-line/70 bg-deep/50 px-3 py-1.5 backdrop-blur-xl">
              <p className="text-[11px] text-mutedstar md:hidden">{t("common.brand")}</p>
              <p className="hidden text-[11px] text-mutedstar md:block">{t("nav.headerNote")}</p>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <ModeToggle />
              </div>
            </header>
          </HideInEmbed>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
      <HideInEmbed>
        <Tutorial />
      </HideInEmbed>
    </ResearchProvider>
  );
}
