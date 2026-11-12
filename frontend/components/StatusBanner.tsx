"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DataCollections, DataSource } from "@/lib/types";

/** Live archive connectivity probe. Never a fixed "ONLINE" badge. */
export function useDataSources() {
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
      setError(e instanceof Error ? e.message : "No se pudo comprobar el estado del archivo");
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
  if (!collections || collections.used.length === 0) return null;
  return (
    <p className="mt-1 text-mutedstar">
      Entregas SPHEREx: {collections.used.join(", ")}
      {collections.source === "configured" && (
        <span className="block text-gold">
          Lista configurada de respaldo: no se pudo preguntar a IRSA qué entregas existen.
        </span>
      )}
    </p>
  );
}
