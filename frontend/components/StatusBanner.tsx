"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DataSource } from "@/lib/types";

/** Live archive connectivity probe. Never a fixed "ONLINE" badge. */
export function useDataSources() {
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.dataSources();
      setSources(res.sources);
      setNote(res.archive_note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status check failed");
      setSources(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { sources, note, error, loading, refresh };
}

export function StatusDot({ ok, pending }: { ok: boolean; pending: boolean }) {
  const color = pending ? "bg-gold" : ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
  );
}
