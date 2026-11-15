import { expect, test } from "@playwright/test";
import { skipTutorial } from "./helpers";

// The e2e build runs without NEXT_PUBLIC_SHOW_EXTRA_PAGES, so the extra pages are hidden.
const HIDDEN = ["/living-sky", "/candidates", "/discoveries", "/journal", "/journal/1", "/login", "/spectral-lab"];

test.describe("extra pages hidden by default", () => {
  test.beforeEach(async ({ page }) => {
    await skipTutorial(page);
  });

  test("the sidebar only links to the core flow", async ({ page }) => {
    await page.goto("/es/observatory");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Observatorio" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Explorador temporal" })).toBeVisible();
    for (const path of HIDDEN) {
      await expect(page.locator(`a[href$="${path}"]`)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Explorar el cielo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buscar un objeto" })).toHaveCount(0);
  });

  for (const path of HIDDEN) {
    test(`${path} renders the not-found page`, async ({ page }) => {
      const response = await page.goto(`/es${path}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
    });
  }

  test("the landing page does not link to hidden pages", async ({ page }) => {
    await page.goto("/");
    for (const path of HIDDEN) {
      await expect(page.locator(`a[href$="${path}"], iframe[src$="${path}"]`)).toHaveCount(0);
    }
  });
});

test.describe("investigate mode reveals the extra pages", () => {
  test.beforeEach(async ({ page }) => {
    await skipTutorial(page);
  });

  test("switching to Investigar shows the full menu and unlocks the routes", async ({ page }) => {
    await page.goto("/es/observatory");
    await page.getByRole("tab", { name: "Investigar" }).click();
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Cielo vivo" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Candidatos" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Diario" })).toBeVisible();
    const response = await page.goto("/es/living-sky");
    expect(response?.status()).toBe(200);
  });

  test("switching back to Explorar hides the extra pages again", async ({ page }) => {
    await page.goto("/es/observatory");
    await page.getByRole("tab", { name: "Investigar" }).click();
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Cielo vivo" })).toBeVisible();
    await page.getByRole("tab", { name: "Explorar" }).click();
    await expect(nav.getByRole("link", { name: "Cielo vivo" })).toHaveCount(0);
    const response = await page.goto("/es/living-sky");
    expect(response?.status()).toBe(404);
  });
});
