import { expect, test } from "@playwright/test";
import { TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

test("the before/after view compares the first and the last epoch", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  await page.getByRole("button", { name: "Antes / después" }).click();
  const slider = page.getByRole("slider", { name: "Cortina antes y después" });
  await expect(slider).toBeVisible();
  await slider.fill("30");
  await expect(slider).toHaveValue("30");
  const blink = page.getByTestId("before-after-blink");
  await blink.click();
  await expect(blink).toHaveAttribute("aria-pressed", "true");
});

test("the trajectory and smoothing controls change the view", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  const smooth = page.getByTestId("smooth-toggle");
  await expect(smooth).toBeChecked();
  await smooth.uncheck();
  await expect(page.locator('img[src*="/frames/"]').first()).toHaveCSS("image-rendering", /pixelated|crisp-edges/);
  await expect(page.getByTestId("trajectory-label")).toContainText("″");
});

test("the advanced panels are collapsed on the first screen", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  const advanced = page.getByTestId("advanced-panels");
  await expect(advanced).toBeVisible();
  await expect(advanced.locator("details[open]")).toHaveCount(0);
});
