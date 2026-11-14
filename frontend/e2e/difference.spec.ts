import { expect, test } from "@playwright/test";
import { TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

const WISE = TARGETS[2];

test("the difference view shows the frame minus frame A and can be turned off", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(`/en${linkFor(WISE)}`);
  await waitForSequence(page);

  const toggle = page.getByTestId("difference-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("difference-legend")).toContainText("Frame shown minus frame A (1).");

  // Step to the last frame: real changes against frame 1 must appear as coloured pixels.
  await page.getByRole("button", { name: /previous/i }).first().click();
  const canvas = page.getByTestId("difference-canvas");
  await expect(canvas).toBeVisible();
  const colouredPixels = () =>
    canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      if (!ctx || el.width === 0) return 0;
      const d = ctx.getImageData(0, 0, el.width, el.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2]) n += 1;
      return n;
    });
  await expect.poll(colouredPixels, { timeout: 20_000 }).toBeGreaterThan(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("difference-canvas")).toHaveCount(0);
  await expect(page.locator('img[src*="/frames/"]').first()).toBeVisible();
});
