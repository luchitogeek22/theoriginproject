import { expect, type Page } from "@playwright/test";

export const TARGETS = [
  { name: "Barnard's Star", ra: 269.452077, dec: 4.693365, mode: "motion" },
  { name: "Epsilon Indi B", ra: 331.044147, dec: -56.782844, mode: "motion" },
  { name: "WISE 0855", ra: 133.818908, dec: -7.247048, mode: "motion" },
  { name: "RW Aurigae", ra: 76.956526, dec: 30.401438, mode: "brightness" },
  { name: "R Draconis", ra: 248.167611, dec: 66.754979, mode: "brightness" },
] as const;

export function linkFor(t: (typeof TARGETS)[number], extra = ""): string {
  return `/time-explorer?ra=${t.ra.toFixed(6)}&dec=${t.dec.toFixed(6)}&fov=6&mode=${t.mode}${extra}`;
}

export async function skipTutorial(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("origin-tutorial-done", "1"));
}

export const FRAME = 'img[src*="/frames/"]';

export async function waitForSequence(page: Page): Promise<void> {
  await expect(page.locator(FRAME).first()).toBeVisible({ timeout: 90_000 });
}
