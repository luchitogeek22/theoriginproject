"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center p-6" role="alert">
      <div className="max-w-md rounded border border-line bg-deep p-5 text-center">
        <h1 className="text-base font-bold text-starlight">{t("errorPage.title")}</h1>
        <p className="mt-2 text-xs text-mutedstar">
          {t("errorPage.body")}
          {error.digest ? ` ${t("errorPage.reference", { digest: error.digest })}` : ""}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-pulse px-3 py-1.5 text-xs font-bold text-starlight hover:brightness-110"
          >
            {t("common.retry")}
          </button>
          <Link href="/" className="rounded border border-line px-3 py-1.5 text-xs text-starlight hover:border-pulse">
            {t("common.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
