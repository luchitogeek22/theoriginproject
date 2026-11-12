import { assetUrl } from "@/lib/api";
import { TranslatableError } from "@/lib/errors";
import type { SequenceFrame } from "@/lib/types";

/** Text burned into exported images, supplied by the caller in the active language. */
export interface ExportLabels {
  /** Credit line, e.g. "Data: NASA/IPAC IRSA, SPHEREx". */
  attribution: string;
  /** Shown instead of the wavelength when it is unknown. */
  noWavelength: string;
  /** Word used in PNG file names, e.g. "frame". */
  frameFile: string;
}

const FRAME_PX = 1024;
const FOOTER_PX = 84;
const HOLD_MS = 700;
const WEBM_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export type ExportPath = "webm" | "png";

export class ExportError extends TranslatableError {}

export function loadFrameImage(frame: SequenceFrame): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new ExportError("A frame could not be loaded with read permission (CORS).", "exportCors")
      );
    img.src = assetUrl(frame.png_url);
  });
}

/** Scientific caption: wavelength keeps invariant notation (dot decimal) in every language. */
function formatWavelength(um: number | null, labels: ExportLabels): string {
  return um === null ? `λ ${labels.noWavelength}` : `λ ${um.toFixed(3)} µm`;
}

export function drawFrame(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  frame: SequenceFrame,
  total: number,
  labels: ExportLabels
): void {
  if (canvas.width !== FRAME_PX) canvas.width = FRAME_PX;
  if (canvas.height !== FRAME_PX + FOOTER_PX) canvas.height = FRAME_PX + FOOTER_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ExportError("This browser cannot draw on a canvas.", "exportNoCanvas");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, FRAME_PX, FRAME_PX);
  ctx.fillStyle = "#0a1220";
  ctx.fillRect(0, FRAME_PX, FRAME_PX, FOOTER_PX);
  ctx.fillStyle = "#f2f6fb";
  ctx.textBaseline = "middle";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(
    `${frame.index + 1}/${total} · ${frame.date_iso} · detector ${frame.detector} · ${formatWavelength(frame.wavelength_um, labels)}`,
    16,
    FRAME_PX + 28
  );
  ctx.fillStyle = "#9db0c7";
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText(`${labels.attribution} · THE ORIGIN PROJECT`, 16, FRAME_PX + 62);
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    throw new ExportError("The canvas is tainted by the image origin (CORS).", "exportCors");
  }
}

function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ExportError("The PNG image could not be generated.", "exportPng"))), "image/png")
  );
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function frameName(base: string, frame: SequenceFrame, total: number, labels: ExportLabels): string {
  const digits = String(total).length;
  return `${base}-${labels.frameFile}-${String(frame.index + 1).padStart(Math.max(2, digits), "0")}.png`;
}

export async function downloadPng(frame: SequenceFrame, total: number, base: string, labels: ExportLabels): Promise<void> {
  const img = await loadFrameImage(frame);
  const canvas = document.createElement("canvas");
  drawFrame(canvas, img, frame, total, labels);
  const url = URL.createObjectURL(await toBlob(canvas));
  download(url, frameName(base, frame, total, labels));
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pickWebmType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    return null;
  }
  return WEBM_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

async function recordWebm(
  images: HTMLImageElement[],
  frames: SequenceFrame[],
  mimeType: string,
  base: string,
  labels: ExportLabels,
  onProgress: (done: number) => void
): Promise<void> {
  const canvas = document.createElement("canvas");
  drawFrame(canvas, images[0], frames[0], frames.length, labels);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new ExportError("The video recorder failed.", "exportRecorder"));
  });
  recorder.start();
  try {
    for (let i = 0; i < frames.length; i += 1) {
      drawFrame(canvas, images[i], frames[i], frames.length, labels);
      onProgress(i + 1);
      await wait(HOLD_MS);
    }
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
  await stopped;
  const blob = new Blob(chunks, { type: "video/webm" });
  if (blob.size === 0) throw new ExportError("The video is empty.", "exportEmptyVideo");
  const url = URL.createObjectURL(blob);
  download(url, `${base}.webm`);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Exports one video segment per frame; falls back to one PNG per frame. Returns the path used. */
export async function exportSequence(
  frames: SequenceFrame[],
  base: string,
  labels: ExportLabels,
  onProgress: (done: number, total: number, phase: "loading" | "recording" | "png") => void
): Promise<ExportPath> {
  const images: HTMLImageElement[] = [];
  for (const f of frames) {
    images.push(await loadFrameImage(f));
    onProgress(images.length, frames.length, "loading");
  }
  const mimeType = pickWebmType();
  if (mimeType) {
    try {
      await recordWebm(images, frames, mimeType, base, labels, (d) => onProgress(d, frames.length, "recording"));
      return "webm";
    } catch (e) {
      if (e instanceof ExportError && e.code === "exportCors") throw e;
    }
  }
  const canvas = document.createElement("canvas");
  for (let i = 0; i < frames.length; i += 1) {
    drawFrame(canvas, images[i], frames[i], frames.length, labels);
    const url = URL.createObjectURL(await toBlob(canvas));
    download(url, frameName(base, frames[i], frames.length, labels));
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    onProgress(i + 1, frames.length, "png");
    await wait(300);
  }
  return "png";
}
