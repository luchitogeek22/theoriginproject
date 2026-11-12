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
            <header className="relative z-30 flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-deep/40 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150">
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
