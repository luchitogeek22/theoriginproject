"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import type { DataCollections, DataSource } from "@/lib/types";

/** Live archive connectivity probe. Never a fixed "ONLINE" badge. */
export function useDataSources() {
  const t = useTranslations("statusBanner");
  const errorText = useErrorText();
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [note, setNote] = useState("");
  const [collections, setCollections] = useState<DataCollections | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.dataSources();
      setSources(res.sources);
      setNote(res.archive_note);
      setCollections(res.collections ?? null);
    } catch (e) {
      setError(errorText(e, t("error")));
      setSources(null);
      setCollections(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { sources, note, collections, error, loading, refresh };
}

export function StatusDot({ ok, pending }: { ok: boolean; pending: boolean }) {
  const color = pending ? "bg-gold" : ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
  );
}

export function DataRelease({ collections }: { collections: DataCollections | null }) {
  const t = useTranslations("statusBanner");
  if (!collections || collections.used.length === 0) return null;
  return (
    <p className="mt-1 text-mutedstar">
      {t("releases", { releases: collections.used.join(", ") })}
      {collections.source === "configured" && (
        <span className="block text-gold">{t("configuredFallback")}</span>
      )}
    </p>
  );
}
