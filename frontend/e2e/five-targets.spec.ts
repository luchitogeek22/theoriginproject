import { expect, test } from "@playwright/test";
import { FRAME, TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

for (const target of TARGETS) {
  test(`${target.name}: the permanent link shows a real sequence that changes when played`, async ({ page }) => {
    await skipTutorial(page);
    await page.goto(linkFor(target));
    await waitForSequence(page);

    await expect(page.getByText(/Queried on .*from cache/)).toBeVisible();
    await expect(page.getByText(/\d+ \/ \d+/).first()).toBeVisible();

    const pause = page.getByRole("button", { name: "Pause" });
    const play = page.getByRole("button", { name: /Play/ });
    // The player starts on its own once frames are preloaded, so a click can race with autoplay
    // (and even pause it). Retry until it is playing instead of relying on the order of events.
    await expect
      .poll(
        async () => {
          if (await pause.isVisible().catch(() => false)) return true;
          await play.click({ timeout: 1_000 }).catch(() => {});
          return pause.isVisible().catch(() => false);
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    const first = await page.locator(FRAME).first().getAttribute("src");
    await expect
      .poll(async () => page.locator(FRAME).first().getAttribute("src"), { timeout: 30_000 })
      .not.toBe(first);

    if (target.mode === "motion") {
      await expect(page.getByTestId("motion-sentence")).toContainText("Moved");
    } else {
      await expect(page.getByTestId("motion-sentence")).toHaveCount(0);
    }
  });
}

test("R Draconis explains that its core saturates and which method was used", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[4]));
  await waitForSequence(page);
  await expect(page.getByText(/The target saturates its core/).first()).toBeVisible({ timeout: 30_000 });
});

test("limitations from the server are shown verbatim in English", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  await expect(page.getByText(/were excluded: a sequence uses one detector/).first()).toBeVisible();
});

test("limitations from the server are translated in Spanish", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(`/es${linkFor(TARGETS[2])}`);
  await waitForSequence(page);
  await expect(page.getByText(/Se excluyeron los detectores/).first()).toBeVisible();
  await expect(page.getByText("were excluded")).toHaveCount(0);
});

test("R Draconis saturation note is translated in Spanish", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(`/es${linkFor(TARGETS[4])}`);
  await waitForSequence(page);
  await expect(page.getByText(/El objetivo satura su núcleo/).first()).toBeVisible({ timeout: 30_000 });
});
