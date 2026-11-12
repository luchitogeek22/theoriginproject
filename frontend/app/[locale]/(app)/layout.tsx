import { getTranslations } from "next-intl/server";
import HideInEmbed from "@/components/HideInEmbed";
import LanguageSwitcher from "@/components/language-switcher/LanguageSwitcher";
import Sidebar from "@/components/Sidebar";
import Tutorial from "@/components/Tutorial";
import ModeToggle from "@/components/ModeToggle";
import { metadataFor } from "@/i18n/metadata";
import { ResearchProvider } from "@/lib/store";

/** Observatory (`/`) metadata; each section's own layout overrides it. */
export const generateMetadata = metadataFor("observatory", "/");

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
            <header className="flex items-center justify-between gap-2 border-b border-line bg-deep/60 px-3 py-1.5">
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
