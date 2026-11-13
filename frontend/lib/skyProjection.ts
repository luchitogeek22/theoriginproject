const DEG = Math.PI / 180;
const WIDTH = 1000;
const HEIGHT = 500;
const SCALE = WIDTH / (4 * Math.SQRT2);

export const MAP_SIZE = { width: WIDTH, height: HEIGHT };

export function project(raDeg: number, decDeg: number): { x: number; y: number } {
  const lambda = (180 - raDeg) * DEG;
  const phi = decDeg * DEG;
  const denominator = Math.sqrt(1 + Math.cos(phi) * Math.cos(lambda / 2));
  const x = (2 * Math.SQRT2 * Math.cos(phi) * Math.sin(lambda / 2)) / denominator;
  const y = (Math.SQRT2 * Math.sin(phi)) / denominator;
  return { x: WIDTH / 2 + x * SCALE, y: HEIGHT / 2 - y * SCALE };
}

export function galacticToEquatorial(lDeg: number, bDeg: number): { ra: number; dec: number } {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const raPole = 192.85948 * DEG;
  const decPole = 27.12825 * DEG;
  const lNorthCelestialPole = 122.93192 * DEG;
  const sinDec = Math.sin(decPole) * Math.sin(b) + Math.cos(decPole) * Math.cos(b) * Math.cos(lNorthCelestialPole - l);
  const dec = Math.asin(sinDec);
  const y = Math.cos(b) * Math.sin(lNorthCelestialPole - l);
  const x = Math.sin(b) * Math.cos(decPole) - Math.cos(b) * Math.sin(decPole) * Math.cos(lNorthCelestialPole - l);
  const ra = (raPole + Math.atan2(y, x)) / DEG;
  return { ra: ((ra % 360) + 360) % 360, dec: dec / DEG };
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyline(points: Array<{ x: number; y: number; ra: number }>): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let previousRa: number | null = null;
  for (const p of points) {
    if (previousRa !== null && Math.abs(p.ra - previousRa) > 180) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    }
    current.push(`${current.length === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    previousRa = p.ra;
  }
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

export function meridianPaths(stepDeg = 30): string[] {
  const out: string[] = [];
  for (let ra = 0; ra < 360; ra += stepDeg) {
    const points = [];
    for (let dec = -90; dec <= 90; dec += 3) points.push({ ...project(ra, dec), ra });
    out.push(...polyline(points));
  }
  return out;
}

export function parallelPaths(stepDeg = 30): string[] {
  const out: string[] = [];
  for (let dec = -60; dec <= 60; dec += stepDeg) {
    const points = [];
    for (let ra = 359.9; ra >= 0.1; ra -= 3) points.push({ ...project(ra, dec), ra });
    out.push(...polyline(points));
  }
  return out;
}

export function galacticPlanePaths(): string[] {
  const points = [];
  for (let l = 0; l <= 360; l += 2) {
    const { ra, dec } = galacticToEquatorial(l, 0);
    points.push({ ...project(ra, dec), ra });
  }
  return polyline(points);
}

export function outlinePath(): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let dec = -90; dec <= 90; dec += 3) {
    const l = project(359.999, dec);
    const r = project(0.001, dec);
    left.push(`${l.x.toFixed(1)} ${l.y.toFixed(1)}`);
    right.push(`${r.x.toFixed(1)} ${r.y.toFixed(1)}`);
  }
  return `M${right.join(" L")} L${left.reverse().join(" L")} Z`;
}

export function starField(count = 260): Array<{ x: number; y: number; r: number; o: number; twinkle: boolean }> {
  const random = seededRandom(20260512);
  const stars = [];
  for (let i = 0; i < count; i++) {
    let ra: number;
    let dec: number;
    if (random() < 0.45) {
      const l = random() * 360;
      const b = (random() + random() + random() - 1.5) * 18;
      ({ ra, dec } = galacticToEquatorial(l, b));
    } else {
      ra = random() * 360;
      dec = Math.asin(2 * random() - 1) / DEG;
    }
    const { x, y } = project(ra, dec);
    stars.push({ x, y, r: 0.5 + random() * 1.1, o: 0.25 + random() * 0.65, twinkle: random() < 0.12 });
  }
  return stars;
}
