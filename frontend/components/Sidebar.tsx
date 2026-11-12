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
import ArchiveStatus from "@/components/ArchiveStatus";
import AuthButton from "@/components/AuthButton";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/observatory", key: "observatory", icon: Telescope },
  { href: "/living-sky", key: "livingSky", icon: Orbit },
  { href: "/time-explorer", key: "timeExplorer", icon: Clock3 },
  { href: "/spectral-lab", key: "spectralLab", icon: FlaskConical },
  { href: "/candidates", key: "candidates", icon: Sparkles },
  { href: "/journal", key: "journal", icon: BookOpenText },
] as const;

/** Logo mark: a fixed "star" at the centre with a small point actually orbiting it, the
 * wrapper spins so the dot's own position sweeps the circle (not just a rotating gradient). */
function Mark() {
  return (
    <span className="relative inline-flex h-7 w-7 flex-none items-center justify-center" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border border-pulse/30" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-pulse"
        style={{ boxShadow: "0 0 6px 2px rgba(36,86,184,.8)" }}
      />
      <span className="absolute inset-0 animate-[spin_8s_linear_infinite] motion-reduce:animate-none">
        <span className="absolute left-1/2 top-0 h-[4px] w-[4px] -translate-x-1/2 rounded-full" style={{ background: "#6f9be8" }} />
      </span>
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
            className={`group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-[13px] transition-colors ${
              active ? "bg-gradient-to-r from-pulse/20 to-transparent text-starlight" : "text-mutedstar hover:bg-panel/60 hover:text-starlight"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-2 left-0 w-[2px] rounded-full transition-colors ${
                active ? "bg-pulse" : "bg-transparent"
              }`}
              style={active ? { boxShadow: "0 0 10px 1px rgba(36,86,184,.75)" } : undefined}
            />
            <span
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg border transition-colors ${
                active
                  ? "border-pulse bg-pulse text-starlight"
                  : "border-line/80 bg-abyss/50 text-mutedstar group-hover:border-pulse/40 group-hover:text-starlight"
              }`}
              style={active ? { boxShadow: "0 0 14px -3px rgba(36,86,184,.7)" } : undefined}
            >
              <Icon size={16} />
            </span>
            <span className={`hidden truncate md:inline ${active ? "font-semibold" : ""}`}>{label}</span>
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col gap-2">
        <ArchiveStatus />
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
