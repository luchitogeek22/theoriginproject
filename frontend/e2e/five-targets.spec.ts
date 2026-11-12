import { expect, test } from "@playwright/test";
import { FRAME, TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

for (const target of TARGETS) {
  test(`${target.name}: the permanent link shows a real sequence that changes when played`, async ({ page }) => {
    await skipTutorial(page);
    await page.goto(linkFor(target));
    await waitForSequence(page);

    await expect(page.getByText(/Consultado el .*desde caché/)).toBeVisible();
    await expect(page.getByText(/\d+ \/ \d+/).first()).toBeVisible();

    const pause = page.getByRole("button", { name: "Pausar" });
    const play = page.getByRole("button", { name: /Reproducir/ });
    if (await play.isVisible().catch(() => false)) await play.click();
    await expect(pause).toBeVisible({ timeout: 30_000 });

    const first = await page.locator(FRAME).first().getAttribute("src");
    await expect
      .poll(async () => page.locator(FRAME).first().getAttribute("src"), { timeout: 30_000 })
      .not.toBe(first);

    if (target.mode === "motion") {
      await expect(page.getByTestId("motion-sentence")).toContainText("Se movió");
    } else {
      await expect(page.getByTestId("motion-sentence")).toHaveCount(0);
    }
  });
}

test("R Draconis explains that its core saturates and which method was used", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[4]));
  await waitForSequence(page);
  await expect(page.getByText(/El objetivo satura su núcleo/).first()).toBeVisible({ timeout: 30_000 });
});

test("limitations from the server are shown in Spanish", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  await expect(page.getByText(/Se excluyeron los detectores/).first()).toBeVisible();
  await expect(page.getByText("were excluded")).toHaveCount(0);
});
