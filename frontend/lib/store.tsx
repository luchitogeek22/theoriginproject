"use client";

/** Global research state: target, observations, cutouts, analysis, candidates.
 * Mode switches (explore/investigate) never clear the investigation.
 * Persisted to localStorage so work survives navigation.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Candidate, Cutout, Mode, Observation, SearchResult, Target } from "./types";

interface ResearchState {
  mode: Mode;
  setMode: (m: Mode) => void;
  target: Target | null;
  setTarget: (t: Target | null) => void;
  search: SearchResult | null;
  setSearch: (s: SearchResult | null) => void;
  selected: Observation[];
  toggleSelected: (o: Observation) => void;
  clearSelected: () => void;
  cutouts: Cutout[];
  addCutout: (c: Cutout) => void;
  candidates: Candidate[];
  setCandidates: (c: Candidate[]) => void;
  focusTarget: { ra: number; dec: number; nonce: number } | null;
  requestFocus: (ra: number, dec: number) => void;
  reset: () => void;
}

const Ctx = createContext<ResearchState | null>(null);
const LS_KEY = "origin-research-v1";

function load(): Partial<{ mode: Mode; target: Target | null; search: SearchResult | null }> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as object) : {};
  } catch {
    return {};
  }
}

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("explore");
  const [target, setTarget] = useState<Target | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Observation[]>([]);
  const [cutouts, setCutouts] = useState<Cutout[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ ra: number; dec: number; nonce: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = load();
    if (saved.mode) setMode(saved.mode);
    if (saved.target) setTarget(saved.target);
    if (saved.search) setSearch(saved.search);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ mode, target, search }));
    } catch {
      /* storage full/blocked: session continues in memory */
    }
  }, [mode, target, search, hydrated]);

  const value = useMemo<ResearchState>(
    () => ({
      mode,
      setMode,
      target,
      setTarget,
      search,
      setSearch,
      selected,
      toggleSelected: (o) =>
        setSelected((prev) =>
          prev.some((p) => p.id === o.id && p.obs_id === o.obs_id)
            ? prev.filter((p) => !(p.id === o.id && p.obs_id === o.obs_id))
            : [...prev, o].slice(-8)
        ),
      clearSelected: () => setSelected([]),
      cutouts,
      addCutout: (c) => setCutouts((prev) => (prev.some((p) => p.cutout_id === c.cutout_id) ? prev : [...prev, c])),
      candidates,
      setCandidates,
      focusTarget,
      requestFocus: (ra, dec) => setFocusTarget((f) => ({ ra, dec, nonce: (f?.nonce ?? 0) + 1 })),
      reset: () => {
        setTarget(null);
        setSearch(null);
        setSelected([]);
        setCutouts([]);
        try {
          localStorage.removeItem(LS_KEY);
        } catch { /* noop */ }
      },
    }),
    [mode, target, search, selected, cutouts, candidates, focusTarget]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResearch(): ResearchState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResearch must be used within ResearchProvider");
  return ctx;
}
