"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Must stay >= the CSS transition duration below so collapsed content unmounts after the shrink finishes. */
const CLOSE_DELAY_MS = 220;

interface AccordionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function Accordion({ title, children, defaultOpen = false, onOpenChange }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const closeTimeout = useRef<number>();

  useEffect(() => () => window.clearTimeout(closeTimeout.current), []);

  const toggle = () => {
    const next = !open;
    onOpenChange?.(next);
    window.clearTimeout(closeTimeout.current);
    if (next) {
      setMounted(true);
      requestAnimationFrame(() => setOpen(true));
    } else {
      setOpen(false);
      closeTimeout.current = window.setTimeout(() => setMounted(false), CLOSE_DELAY_MS);
    }
  };

  return (
    <details open={mounted} className="rounded border border-line bg-deep/60">
      <summary
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
        className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-mutedstar transition-colors duration-150 hover:bg-panel/50 hover:text-starlight [&::-webkit-details-marker]:hidden"
      >
        {title}
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </summary>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </details>
  );
}
