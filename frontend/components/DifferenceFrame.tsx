"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { differenceRgba } from "@/lib/differenceImage";
import { loadFrameImage } from "@/lib/sequenceExport";
import type { SequenceFrame } from "@/lib/types";

/** Changes within 3 sigma of the difference noise are shown as no change. */
const NOISE_SIGMAS = 3;

/** Pixels of every frame, read once with CORS so the canvas can be read back. */
function useFramePixels(frames: SequenceFrame[]) {
  const cache = useRef(new Map<number, Promise<ImageData>>());
  useEffect(() => {
    cache.current = new Map();
  }, [frames]);
  return (frame: SequenceFrame): Promise<ImageData> => {
    let pending = cache.current.get(frame.index);
    if (!pending) {
      pending = loadFrameImage(frame).then((img) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas unavailable");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      });
      pending.catch(() => cache.current.delete(frame.index));
      cache.current.set(frame.index, pending);
    }
    return pending;
  };
}

/** The shown frame minus a reference frame: orange brighter, blue fainter, black unchanged. */
export default function DifferenceFrame({
  frames,
  frame,
  reference,
  smooth,
  alt,
}: {
  frames: SequenceFrame[];
  frame: SequenceFrame;
  reference: SequenceFrame;
  smooth: boolean;
  alt: string;
}) {
  const t = useTranslations("sequencePlayer.difference");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixels = useFramePixels(frames);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([pixels(frame), pixels(reference)])
      .then(([current, base]) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        if (current.width !== base.width || current.height !== base.height) throw new Error("size mismatch");
        canvas.width = current.width;
        canvas.height = current.height;
        const out = new ImageData(
          differenceRgba(current.data, base.data, { noiseSigmas: NOISE_SIGMAS }),
          current.width,
          current.height
        );
        canvas.getContext("2d")?.putImageData(out, 0, 0);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [frame, reference]); // eslint-disable-line react-hooks/exhaustive-deps

  return failed ? (
    <p className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-gold">{t("failed")}</p>
  ) : (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className="h-full w-full"
      style={{ imageRendering: smooth ? "auto" : "pixelated" }}
      data-testid="difference-canvas"
    />
  );
}
