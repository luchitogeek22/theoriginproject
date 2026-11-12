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
import LanguageSwitcher from "@/components/language-switcher/LanguageSwitcher";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/observatory", key: "observatory", icon: Telescope },
  { href: "/living-sky", key: "livingSky", icon: Orbit },
  { href: "/time-explorer", key: "timeExplorer", icon: Clock3 },
  { href: "/spectral-lab", key: "spectralLab", icon: FlaskConical },
  { href: "/candidates", key: "candidates", icon: Sparkles },
  { href: "/journal", key: "journal", icon: BookOpenText },
] as const;

/** Logo mark: a slow rotating ring around a fixed dot, in the single brand accent. */
function Mark() {
  return (
    <span className="relative inline-flex h-7 w-7 flex-none items-center justify-center" aria-hidden="true">
      <span
        className="absolute inset-0 rounded-full animate-[spin_18s_linear_infinite] motion-reduce:animate-none"
        style={{
          background: "conic-gradient(from 0deg, rgba(90,143,224,.9), rgba(90,143,224,0) 55%, rgba(90,143,224,.9))",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1.5px))",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1.5px))",
        }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-pulse"
        style={{ boxShadow: "0 0 6px 2px rgba(90,143,224,.7)" }}
      />
    </span>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const t = useTranslations();
  return (
    <nav
      className="flex w-14 flex-col gap-1 border-r border-line/70 bg-deep/70 py-3 backdrop-blur-xl md:w-56 md:px-2"
      aria-label={t("nav.label")}
    >
      <div className="mb-3 flex items-center gap-2 px-2">
        <Mark />
        <div className="hidden md:block">
          <p className="text-sm font-semibold tracking-tight text-starlight">{t("common.brand")}</p>
          <p className="text-[10px] text-mutedstar">{t("nav.tagline")}</p>
        </div>
      </div>

      {ITEMS.map(({ href, key, icon: Icon }) => {
        const label = t(`nav.${key}`);
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-sm transition-colors ${
              active ? "text-starlight" : "text-mutedstar hover:bg-panel/60 hover:text-starlight"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-1 left-0 w-[3px] rounded-full transition-colors ${
                active ? "bg-pulse" : "bg-transparent"
              }`}
              style={active ? { boxShadow: "0 0 10px 1px rgba(90,143,224,.65)" } : undefined}
            />
            <span
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border transition-colors ${
                active
                  ? "border-pulse/60 bg-pulse/15 text-pulse"
                  : "border-line/80 bg-abyss/50 text-mutedstar group-hover:border-pulse/40 group-hover:text-starlight"
              }`}
              style={active ? { boxShadow: "0 0 14px -3px rgba(90,143,224,.6)" } : undefined}
            >
              <Icon size={16} />
            </span>
            <span className="hidden truncate md:inline">{label}</span>
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col gap-2">
        <div className="hidden justify-center px-1 md:flex">
          <LanguageSwitcher />
        </div>
        <div className="border-t border-line/60 pt-2">
          <AuthButton />
        </div>
        <div className="hidden px-2 text-[10px] leading-snug text-mutedstar/70 md:block">
          {t("nav.footer")}
        </div>
      </div>
    </nav>
  );
}
