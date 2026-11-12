/** Mutable bridge between DOM scroll/input and the WebGL scene. Read inside useFrame, never via React state. */
export const stage = {
  chapter: 0,
  pointerX: 0,
  pointerY: 0,
  epoch: 0,
  difference: 0,
  target: 0,
  intro: 0,
  reducedMotion: false,
  compact: false,
};

export type Vec3 = [number, number, number];

export interface Keyframe {
  cam: Vec3;
  look: Vec3 | "target";
  planet: number;
  sphereScale: number;
  sphereOpacity: number;
  scan: number;
  telescope: number;
  epochPanel: number;
  light: Vec3;
}

export const KEYFRAMES: Keyframe[] = [
  { cam: [0, 0.35, 7.2], look: [0, 0, 0], planet: 1, sphereScale: 2.3, sphereOpacity: 0, scan: 0, telescope: 0, epochPanel: 0, light: [1, 0.45, 0.65] },
  { cam: [0, 1.5, 10], look: [6, 0, -60], planet: 0, sphereScale: 60, sphereOpacity: 1, scan: 0, telescope: 0, epochPanel: 0, light: [1, 0.45, 0.65] },
  { cam: [1, 5, 25], look: [-7.5, 0, 0], planet: 0, sphereScale: 10, sphereOpacity: 1, scan: 1, telescope: 1, epochPanel: 0, light: [1, 0.45, 0.65] },
  { cam: [0, 0, -42], look: [0, 0, -60], planet: 0, sphereScale: 10, sphereOpacity: 0, scan: 1, telescope: 0, epochPanel: 1, light: [1, 0.45, 0.65] },
  { cam: [0, 0, 0], look: "target", planet: 0, sphereScale: 60, sphereOpacity: 1, scan: 1, telescope: 0, epochPanel: 0, light: [1, 0.45, 0.65] },
  { cam: [30, 12, 150], look: [0, 0, 0], planet: 0, sphereScale: 60, sphereOpacity: 0.55, scan: 1, telescope: 0, epochPanel: 0, light: [1, 0.45, 0.65] },
  { cam: [-45, -12, 175], look: [0, 0, 0], planet: 0, sphereScale: 60, sphereOpacity: 0.2, scan: 1, telescope: 0, epochPanel: 0, light: [0.75, 0.25, -0.45] },
  { cam: [-8.2, 2.4, -9.2], look: [1.2, -0.6, 3.2], planet: 1, sphereScale: 2.3, sphereOpacity: 0, scan: 1, telescope: 0, epochPanel: 0, light: [0.75, 0.25, -0.45] },
];

export const smooth = (t: number) => t * t * (3 - 2 * t);

export function chapterBlend(chapter: number) {
  const max = KEYFRAMES.length - 1;
  const c = Math.min(Math.max(chapter, 0), max);
  const i = Math.min(Math.floor(c), max - 1);
  return { a: KEYFRAMES[i], b: KEYFRAMES[i + 1], t: smooth(c - i), index: i };
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function damp(current: number, target: number, lambda: number, dt: number) {
  return mix(current, target, 1 - Math.exp(-lambda * dt));
}
