"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";

function Gate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  if (path.startsWith("/time-explorer") && params.get("embed") === "1") return null;
  return <>{children}</>;
}

/** Hides app chrome (sidebar, header, tutorial) when the time explorer is embedded with `?embed=1`. */
export default function HideInEmbed({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
