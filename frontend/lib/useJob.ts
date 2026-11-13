"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import type { JobStatus } from "@/lib/types";

export type JobPhase = "idle" | "creating" | "running" | "completed" | "failed" | "cancelled";

export interface JobState<T> {
  phase: JobPhase;
  job: JobStatus | null;
  result: T | null;
  /** User-facing error text in the active language ("" when there is no error). */
  error: string;
  errorStatus: number | null;
  forKey: string | null;
  /** Raw failure, translated on render so a language switch also updates the message. */
  cause?: unknown;
}

const STORAGE_PREFIX = "origin-job:";
const FIRST_DELAY_MS = 800;
const MAX_DELAY_MS = 5000;
const BACKOFF = 1.5;
const MAX_CONSECUTIVE_NETWORK_ERRORS = 2;

const IDLE: JobState<never> = { phase: "idle", job: null, result: null, error: "", errorStatus: null, forKey: null };

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeStored(key: string, jobId: string | null) {
  try {
    if (jobId) sessionStorage.setItem(STORAGE_PREFIX + key, jobId);
    else sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* storage blocked: the job just cannot be recovered after a reload */
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

function waitVisible(signal: AbortSignal): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener("visibilitychange", onChange);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const onChange = () => {
      if (!document.hidden) done();
    };
    document.addEventListener("visibilitychange", onChange);
    signal.addEventListener("abort", done);
  });
}

/**
 * Runs one backend job identified by `key` (null = idle).
 * Polls with backoff, pauses while the tab is hidden, tolerates one isolated
 * network error, stops on unmount and recovers the job id after a reload.
 */
export function useJob<T>(
  key: string | null,
  create: (signal: AbortSignal) => Promise<JobStatus>
): JobState<T> & { cancel: () => void; retry: () => void } {
  const [state, setState] = useState<JobState<T>>(IDLE as JobState<T>);
  const [attempt, setAttempt] = useState(0);
  const createRef = useRef(create);
  createRef.current = create;
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (key === null) {
      setState(IDLE as JobState<T>);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    const fail = (e: unknown) => {
      if (signal.aborted) return;
      writeStored(key, null);
      setState((s) => ({
        forKey: key,
        phase: "failed",
        job: s.job,
        result: null,
        error: "",
        cause: e,
        errorStatus: e instanceof ApiError ? e.status : null,
      }));
    };

    const run = async () => {
      setState({ ...(IDLE as JobState<T>), phase: "creating", forKey: key });
      let job: JobStatus | null = null;
      const stored = attempt === 0 ? readStored(key) : null;
      if (stored) {
        try {
          job = await api.jobStatus(stored, { signal });
        } catch (e) {
          if (isAbort(e) || signal.aborted) return;
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          writeStored(key, null);
        }
      }
      if (!job) {
        job = await createRef.current(signal);
        if (signal.aborted) return;
        writeStored(key, job.job_id);
      }

      let delay = FIRST_DELAY_MS;
      let networkErrors = 0;
      for (;;) {
        if (signal.aborted) return;
        setState((s) => ({ ...s, phase: "running", job, forKey: key }));
        if (job.status === "completed") {
          const full = await api.jobResults<T>(job.job_id, { signal });
          if (signal.aborted) return;
          setState({ phase: "completed", job, result: full.result, error: "", errorStatus: null, forKey: key });
          return;
        }
        if (job.status === "failed") {
          throw job.error
            ? new ApiError(500, job.error)
            : new ApiError(500, "The job failed in the science service.", "jobFailed");
        }
        await sleep(delay, signal);
        await waitVisible(signal);
        if (signal.aborted) return;
        delay = Math.min(MAX_DELAY_MS, delay * BACKOFF);
        try {
          job = await api.jobStatus(job.job_id, { signal });
          networkErrors = 0;
        } catch (e) {
          if (isAbort(e) || signal.aborted) return;
          if (e instanceof ApiError && e.status === 0 && ++networkErrors < MAX_CONSECUTIVE_NETWORK_ERRORS) {
            continue;
          }
          throw e;
        }
      }
    };

    run().catch((e) => {
      if (!isAbort(e)) fail(e);
    });

    return () => controller.abort();
  }, [key, attempt]);

  const cancel = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.abort();
    if (key !== null) writeStored(key, null);
    setState((s) => {
      if (s.phase !== "creating" && s.phase !== "running") return s;
      return { ...s, phase: "cancelled" };
    });
  }, [key]);

  const retry = useCallback(() => {
    if (key !== null) writeStored(key, null);
    setAttempt((n) => n + 1);
  }, [key]);

  const current: JobState<T> =
    key === null
      ? (IDLE as JobState<T>)
      : state.forKey === key
        ? state
        : { ...(IDLE as JobState<T>), phase: "creating", forKey: key };
  const errorText = useErrorText();
  const t = useTranslations("errors");
  const error = current.phase === "failed" ? errorText(current.cause, t("jobFailed")) : current.error;
  return { ...current, error, cancel, retry };
}
