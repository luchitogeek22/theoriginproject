import { expect, test } from "@playwright/test";
import { skipTutorial } from "./helpers";

test.describe("internationalization", () => {
  test.use({ locale: "es-ES" });

  test.beforeEach(async ({ page }) => {
    await skipTutorial(page);
  });

  test("first visit is English even when the browser prefers Spanish", async ({ page }) => {
    await page.goto("/observatory");
    await expect(page).toHaveURL(/\/observatory$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Time explorer" })).toBeVisible();
  });

  test("switching language keeps the page, persists and survives reloads", async ({ page, context }) => {
    await page.goto("/observatory?from=test");
    await page.getByRole("combobox", { name: /Change language/ }).selectOption("es");

    await expect(page).toHaveURL(/\/es\/observatory\?from=test$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Explorador temporal" })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
    expect(cookie?.value).toBe("es");
    expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // A later unprefixed visit honours the remembered choice.
    await page.goto("/time-explorer");
    await expect(page).toHaveURL(/\/es\/time-explorer$/);

    // Navigation inside the app stays in Spanish.
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Observatorio" }).click();
    await expect(page).toHaveURL(/\/es\/observatory$/);

    await page.getByRole("combobox", { name: /Cambiar idioma/ }).selectOption("en");
    await expect(page).toHaveURL(/\/observatory$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value).toBe("en");

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("each language has translated metadata, canonical and hreflang", async ({ page, context }) => {
    await page.goto("/es/observatory");
    await expect(page).toHaveTitle("Observatorio — The Origin Project");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/es\/observatory$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/observatory$/);
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute("href", /\/es\/observatory$/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/observatory$/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "es_ES");

    // Visiting /es remembered Spanish; forget it to look at the English document.
    await context.clearCookies();
    await page.goto("/observatory");
    await expect(page).toHaveTitle("Observatory — The Origin Project");
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
  });

  test("unknown pages show a localized 404", async ({ page }) => {
    const response = await page.goto("/es/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  });

  test("the language switcher is keyboard operable", async ({ page }) => {
    await page.goto("/observatory");
    const select = page.getByRole("combobox", { name: /Change language/ });
    await select.focus();
    await expect(select).toBeFocused();
    await expect(select.locator("option")).toHaveText(["English", "Español"]);
  });

  for (const prefix of ["", "/es"]) {
    test(`no hydration or missing-translation errors (${prefix || "/"})`, async ({ page }) => {
      const problems: string[] = [];
      const watch = (text: string) => {
        if (/hydrat|did not match|MISSING_MESSAGE|INVALID_MESSAGE|FORMATTING_ERROR|IntlError/i.test(text)) problems.push(text);
      };
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") watch(msg.text());
      });
      page.on("pageerror", (error) => watch(error.message));
      for (const path of ["/", "/observatory", "/time-explorer", "/demo"]) {
        await page.goto(`${prefix}${path === "/" && prefix ? "" : path}`);
        await page.waitForLoadState("networkidle");
      }
      expect(problems).toEqual([]);
    });
  }
});
