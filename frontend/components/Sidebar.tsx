"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  Clock3,
  FlaskConical,
  Orbit,
  Sparkles,
  Telescope,
} from "lucide-react";
import AuthButton from "@/components/AuthButton";

const ITEMS = [
  { href: "/", label: "Observatorio", icon: Telescope },
  { href: "/living-sky", label: "Cielo vivo", icon: Orbit },
  { href: "/time-explorer", label: "Explorador temporal", icon: Clock3 },
  { href: "/spectral-lab", label: "Laboratorio espectral", icon: FlaskConical },
  { href: "/candidates", label: "Candidatos", icon: Sparkles },
  { href: "/journal", label: "Diario", icon: BookOpenText },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <nav className="flex w-14 flex-col items-center gap-1 border-r border-line bg-deep/80 py-3 md:w-44 md:items-stretch md:px-2" aria-label="Principal">
      <div className="mb-3 hidden px-2 md:block">
        <p className="text-[13px] font-bold tracking-wide text-starlight">THE ORIGIN PROJECT</p>
        <p className="text-[10px] text-mutedstar">Explora el universo. Comprende sus cambios.</p>
      </div>
      {ITEMS.map(({ href, label, icon: Icon }) => {
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
          Datos reales SPHEREx vía NASA/IPAC IRSA. Iniciativa educativa independiente.
        </div>
      </div>
    </nav>
  );
}
