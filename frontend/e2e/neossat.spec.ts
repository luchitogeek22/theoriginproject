import { expect, test } from "@playwright/test";
import { TARGETS, linkFor, skipTutorial } from "./helpers";

const WISE = TARGETS[2];

test.beforeEach(async ({ page }) => skipTutorial(page));

test("the NEOSSat panel shows CSA coverage from CADC for the position", async ({ page }) => {
  await page.route("**/api/v1/sky/neossat?**", (route) =>
    route.fulfill({
      json: {
        archive: "CADC",
        collection: "NEOSSAT",
        count: 7,
        first_date: "2020-01-16",
        last_date: "2022-01-17",
        radius_deg: 0.25,
        collection_url: "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat",
      },
    })
  );
  await page.goto(`/en${linkFor(WISE)}`);
  await page.getByText("Other missions: NEOSSat (CSA)").click();
  await expect(page.getByTestId("neossat-summary")).toHaveText(
    "7 NEOSSat observations within 0.25° of this position, from 2020-01-16 to 2022-01-17."
  );
  await expect(page.getByRole("link", { name: "Open the NEOSSat collection at CADC" })).toHaveAttribute(
    "href",
    "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat"
  );
});

test("when CADC is unreachable the panel says so and the sequence still works", async ({ page }) => {
  await page.goto(`/es${linkFor(WISE)}`);
  await page.getByText("Otras misiones: NEOSSat (CSA)").click();
  await expect(page.getByTestId("neossat-panel")).toContainText(
    "No se pudo contactar a CADC (archivo de NEOSSat). La secuencia de SPHEREx no se ve afectada."
  );
});
