import { expect, test, type Page } from "@playwright/test";
import { TARGETS, linkFor, skipTutorial, waitForSequence } from "./helpers";

// One transparent pixel: the stack image only needs to load.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const KNOWN_MOTION = {
  ok: true,
  reason: null,
  reference: { source: "Gaia DR3", pm_ra_mas_yr: -802.8, pm_dec_mas_yr: 10362.5, total_arcsec_yr: 10.39 },
  detection: { observed_sigma: 12.1, p_value: 0.0005, sigma_equivalent: 3.3, offset_px: 0.4, n_visits: 12, median_frame_snr: 2.6 },
  measured: {
    measurable: true,
    baseline_days: 190.0,
    measured_arcsec: 5.6,
    predicted_arcsec: 5.4,
    measured_arcsec_yr: 10.8,
    predicted_arcsec_yr: 10.39,
    difference_arcsec: 0.4,
    uncertainty_arcsec: 1.9,
    agreement_sigma: 0.2,
  },
  stack_png_url: "/api/v1/sequences/test-key/known_motion.png",
  limitations: [],
};

/** Rewrites the motion-mode sequence result: `known_motion` replaced, or removed when undefined. */
async function withKnownMotion(page: Page, knownMotion: unknown): Promise<void> {
  await page.route("**/api/v1/jobs/*/results", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body?.result?.mode === "motion") {
      if (knownMotion === undefined) delete body.result.known_motion;
      else body.result.known_motion = knownMotion;
    }
    await route.fulfill({ response, json: body });
  });
  await page.route("**/known_motion.png", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
}

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});

test("the known-motion card compares the measured motion with the catalogue", async ({ page }) => {
  await withKnownMotion(page, KNOWN_MOTION);
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  const card = page.getByTestId("known-motion-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Measured on these frames: 10.8 ± 3.65″/yr");
  await expect(card).toContainText("Catalogue (Gaia DR3): 10.39″/yr");
  await expect(card).toContainText("0.2σ");
  await expect(card).toContainText("median SNR 2.6");
  await expect(card).toContainText("p = 0.0005");
  await expect(card).toContainText("not a discovery");
  const image = card.getByRole("img", { name: "Frames stacked along the catalogued motion" });
  await expect(image).toHaveAttribute("src", /\/api\/v1\/sequences\/test-key\/known_motion\.png$/);
});

test("when the motion cannot be measured the card keeps the detection", async ({ page }) => {
  await withKnownMotion(page, {
    ...KNOWN_MOTION,
    measured: { measurable: false, reason: "The target could not be located in each half of the frames." },
  });
  await page.goto(linkFor(TARGETS[2]));
  await waitForSequence(page);
  const card = page.getByTestId("known-motion-card");
  await expect(card).toContainText("could not be measured on these frames");
  await expect(card).toContainText("could not be located in each half");
  await expect(card).toContainText("p = 0.0005");
  await expect(card).not.toContainText("Measured on these frames:");
});

test("an unavailable check shows its reason in one line", async ({ page }) => {
  await withKnownMotion(page, {
    ok: false,
    reason: "No proper motion known for this position.",
    reference: null,
    detection: null,
    measured: null,
    stack_png_url: null,
    limitations: [],
  });
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  const card = page.getByTestId("known-motion-card");
  await expect(card).toContainText("No proper motion known for this position.");
  await expect(card.getByRole("img")).toHaveCount(0);
});

test("a result without known_motion renders no card", async ({ page }) => {
  await withKnownMotion(page, undefined);
  await page.goto(linkFor(TARGETS[0]));
  await waitForSequence(page);
  await expect(page.getByTestId("known-motion-card")).toHaveCount(0);
});
