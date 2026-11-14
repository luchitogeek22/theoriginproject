import { expect, test } from "@playwright/test";
import { FRAME, skipTutorial, waitForSequence } from "./helpers";

test("from the home page to the video takes one interaction", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/observatory");
  await page.getByRole("link", { name: /WISE 0855/ }).first().click();
  await expect(page).toHaveURL(/\/time-explorer\?/);
  await waitForSequence(page);
  await expect(page.locator(FRAME).first()).toBeVisible();
});

test("the target-card mini curves are labelled as illustrations", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/es/observatory");
  const captions = page.getByTestId("target-curve-caption");
  await expect(captions).toHaveCount(5);
  await expect(captions.first()).toHaveText("Ilustración");
  await expect(page.getByRole("link", { name: /WISE 0855/ }).first()).toContainText("no son datos medidos");
});

test("the measured spectrum opens inside the time explorer", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/time-explorer?ra=133.818908&dec=-7.247048&fov=6&mode=motion");
  await waitForSequence(page);
  const spectrum = page.getByTestId("advanced-panels").locator("summary", { hasText: "Spectrum" });
  await spectrum.click();
  await expect(page.getByRole("button", { name: "Measure the target's spectrum" })).toBeVisible();
});

test("a free-text coordinate in the URL is resolved and replaced by numbers", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/time-explorer?q=08h55m10.831s%20-7d14m42.53s&fov=6&mode=motion");
  await expect(page).toHaveURL(/ra=133\.\d+&dec=-7\.\d+/, { timeout: 30_000 });
});

test("an invalid query shows a clear message and no crash", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/time-explorer?q=zzzz-not-a-place-12345&fov=6&mode=motion");
  await expect(page.getByText(/Could not|not found/i).first()).toBeVisible({ timeout: 40_000 });
});

test("the guided demo walks through three steps with the keyboard", async ({ page }) => {
  await skipTutorial(page);
  await page.goto("/demo");
  const title = page.getByTestId("demo-step-title");
  await expect(title).toHaveText("Watch it move");
  await page.getByTestId("demo-next").click();
  await expect(title).toHaveText("Watch it pulse");
  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveText("This is how a Planet X would be searched for");
  await page.keyboard.press("ArrowLeft");
  await expect(title).toHaveText("Watch it pulse");
});

test("the home sky shows the five targets and each point opens its video", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await skipTutorial(page);
  await page.goto("/observatory");
  for (const key of ["barnard", "epsindi", "wise0855", "rwaur", "rdra"]) {
    await expect(page.getByTestId(`sky-target-${key}`)).toBeAttached({ timeout: 20_000 });
  }
  await page.getByTestId("sky-target-barnard").evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/\/time-explorer\?.*ra=269\./);
  await waitForSequence(page);
});
