"use client";

/** Global research state: target, observations, cutouts, analysis, candidates.
 * Mode switches (explore/investigate) never clear the investigation.
 * Persisted to localStorage so work survives navigation.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { INVESTIGATE_MODE, MODE_COOKIE, SHOW_EXTRA_PAGES } from "./features";
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
  currentJobId: string | null;
  setCurrentJobId: (id: string | null) => void;
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

/** Mirror the mode into a plain cookie so the middleware can unlock the extra pages. */
function writeModeCookie(mode: Mode): void {
  try {
    document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies blocked: the middleware falls back to the feature flag */
  }
}

function readModeCookie(): Mode | null {
  try {
    for (const part of document.cookie.split(";")) {
      const [key, value] = part.trim().split("=");
      if (key === MODE_COOKIE && (value === "explore" || value === INVESTIGATE_MODE)) {
        return value;
      }
    }
  } catch {
    /* cookies blocked: fall through to the default */
  }
  return null;
}

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("explore");
  const [target, setTarget] = useState<Target | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Observation[]>([]);
  const [cutouts, setCutouts] = useState<Cutout[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ ra: number; dec: number; nonce: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = load();
    if (saved.mode) setMode(saved.mode);
    else {
      const cookie = readModeCookie();
      if (cookie) setMode(cookie);
    }
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
      setMode: (m) => {
        setMode(m);
        writeModeCookie(m);
      },
      target,
      setTarget: (t) => {
        setTarget(t);
        setCurrentJobId(null);
      },
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
      currentJobId,
      setCurrentJobId,
      focusTarget,
      requestFocus: (ra, dec) => setFocusTarget((f) => ({ ra, dec, nonce: (f?.nonce ?? 0) + 1 })),
      reset: () => {
        setTarget(null);
        setSearch(null);
        setSelected([]);
        setCutouts([]);
        setCurrentJobId(null);
        try {
          localStorage.removeItem(LS_KEY);
        } catch { /* noop */ }
      },
    }),
    [mode, target, search, selected, cutouts, candidates, currentJobId, focusTarget]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResearch(): ResearchState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResearch must be used within ResearchProvider");
  return ctx;
}

/**
 * True when the extra pages (living sky, candidates, journal, …) are visible: either the
 * build flag is on or the user switched to investigate mode. Never depends on the archive
 * status or on having a session, so the menu cannot be blocked by either.
 */
export function useShowExtraPages(): boolean {
  const { mode } = useResearch();
  return SHOW_EXTRA_PAGES || mode === INVESTIGATE_MODE;
}
