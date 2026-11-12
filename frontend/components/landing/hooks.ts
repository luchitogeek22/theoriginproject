"use client";

import { RefObject, useEffect, useState } from "react";
import { stage } from "./stage";

/** Maps window scroll to a continuous chapter index: k means section k is centred in the viewport. */
export function useStageSync() {
  const [active, setActive] = useState(0);
  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactQuery = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const applyMedia = () => {
      stage.reducedMotion = motionQuery.matches;
      stage.compact = compactQuery.matches;
      setReducedMotion(motionQuery.matches);
      setCompact(compactQuery.matches);
    };
    applyMedia();
    motionQuery.addEventListener("change", applyMedia);
    compactQuery.addEventListener("change", applyMedia);

    let frame = 0;
    let ranges: Array<[number, number]> = [];
    const measure = () => {
      const vh = window.innerHeight;
      ranges = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]")).map((el) => {
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        if (rect.height > vh * 1.6) return [top + vh / 2, top + rect.height - vh / 2];
        const centre = top + rect.height / 2;
        return [centre, centre];
      });
    };
    const update = () => {
      frame = 0;
      if (!ranges.length) return;
      const line = window.scrollY + window.innerHeight / 2;
      const last = ranges.length - 1;
      let chapter = line >= ranges[last][0] ? last : 0;
      for (let i = 0; i < last; i++) {
        const [start, end] = ranges[i];
        const next = ranges[i + 1][0];
        if (line < start) break;
        if (line <= end) {
          chapter = i;
          break;
        }
        if (line < next) {
          chapter = i + (line - end) / Math.max(1, next - end);
          break;
        }
      }
      if (window.scrollY < 4) chapter = 0;
      stage.chapter = chapter;
      setActive(Math.round(chapter));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    const onPointer = (e: PointerEvent) => {
      stage.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      stage.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    measure();
    update();
    const observer = new ResizeObserver(onResize);
    observer.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener("change", applyMedia);
      compactQuery.removeEventListener("change", applyMedia);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return { active, compact, reducedMotion };
}

/** 0 when the section top reaches the viewport top, 1 when its bottom reaches the viewport bottom. */
export function useSectionProgress(ref: RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel > 0 ? -rect.top / travel : rect.top < 0 ? 1 : 0;
      setProgress(Math.min(1, Math.max(0, p)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
  return progress;
}

export function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function scrollToChapter(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
}
