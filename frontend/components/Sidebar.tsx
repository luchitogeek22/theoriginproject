"use client";

import { useTranslations } from "next-intl";
import {
  BookOpenText,
  Clock3,
  FlaskConical,
  Orbit,
  Sparkles,
  Telescope,
} from "lucide-react";
import AuthButton from "@/components/AuthButton";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/", key: "observatory", icon: Telescope },
  { href: "/living-sky", key: "livingSky", icon: Orbit },
  { href: "/time-explorer", key: "timeExplorer", icon: Clock3 },
  { href: "/spectral-lab", key: "spectralLab", icon: FlaskConical },
  { href: "/candidates", key: "candidates", icon: Sparkles },
  { href: "/journal", key: "journal", icon: BookOpenText },
] as const;

export default function Sidebar() {
  const path = usePathname();
  const t = useTranslations();
  return (
    <nav className="flex w-14 flex-col items-center gap-1 border-r border-line bg-deep/80 py-3 md:w-44 md:items-stretch md:px-2" aria-label={t("nav.label")}>
      <div className="mb-3 hidden px-2 md:block">
        <p className="text-[13px] font-bold tracking-wide text-starlight">{t("common.brand")}</p>
        <p className="text-[10px] text-mutedstar">{t("nav.tagline")}</p>
      </div>
      {ITEMS.map(({ href, key, icon: Icon }) => {
        const label = t(`nav.${key}`);
        const active = href === "/" ? path === href : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`flex items-center gap-2 rounded px-2 py-2 text-xs transition-colors ${
              active ? "bg-panel text-pulse" : "text-mutedstar hover:bg-panel hover:text-starlight"
            }`}
          >
            <Icon size={17} />
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1">
        <AuthButton />
        <div className="hidden px-2 text-[10px] leading-snug text-mutedstar/70 md:block">
          {t("nav.footer")}
        </div>
      </div>
    </nav>
  );
}
