import { expect, test } from "@playwright/test";
import { FRAME, TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

test("the copied link restores the same state in a new window", async ({ page, context }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("ra=133.8");
  expect(copied).toContain("mode=motion");

  const other = await context.newPage();
  await other.goto(copied);
  await waitForSequence(other);
  await expect(other.locator(FRAME).first()).toBeVisible();
});

test("embed mode hides the navigation and keeps the attribution", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[0], "&embed=1"));
  await waitForSequence(page);
  await expect(page.getByRole("link", { name: "Observatorio" })).toHaveCount(0);
  await expect(page.getByText(/Datos: NASA\/IPAC IRSA, SPHEREx/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir en THE ORIGIN PROJECT/ })).toBeVisible();
});

test("the tool can be embedded in a page from another origin, the rest of the site cannot", async ({ page, baseURL }) => {
  await page.route("http://embedder.example/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        `<iframe id="ok" src="${baseURL}${linkFor(TARGETS[0], "&embed=1")}" width="900" height="700"></iframe>` +
        `<iframe id="blocked" src="${baseURL}/candidates" width="400" height="300"></iframe>`,
    }),
  );
  await skipTutorial(page);
  await page.goto("http://embedder.example/");
  const ok = page.frameLocator("#ok");
  await expect(ok.locator(FRAME).first()).toBeVisible({ timeout: 90_000 });
  await expect(ok.getByText(/Datos: NASA\/IPAC IRSA, SPHEREx/)).toBeVisible();
  const blocked = page.frames().find((f) => f.url().includes("/candidates"));
  expect(blocked).toBeUndefined();

  const response = await page.request.get(`${baseURL}/candidates`);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const framed = await page.request.get(`${baseURL}/time-explorer`);
  expect(framed.headers()["x-frame-options"]).toBeUndefined();
  expect(framed.headers()["content-security-policy"]).toContain("frame-ancestors *");
});

test("the current frame can be downloaded as PNG", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Descargar cuadro actual (PNG)" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test("the sequence can be exported as video or, when the browser cannot, as PNG files", async ({ page }) => {
  await skipTutorial(page);
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "Exportar video (WebM)" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|png)$/);
});
