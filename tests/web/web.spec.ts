import { expect, test, type Page } from "@playwright/test";

/** Reads the rendered xterm screen buffer via the app's test hook. */
async function screenText(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __lanternScreenText?: () => string }
      ).__lanternScreenText?.() ?? "",
  );
}

/** Waits until the bundled song has loaded into the session. */
async function waitForSong(page: Page): Promise<void> {
  await expect(page.locator("#shell-status")).not.toHaveText("Loading…", {
    timeout: 20_000,
  });
  await expect
    .poll(() => screenText(page), { timeout: 20_000 })
    .toContain("aleph_lab01");
}

/** Clears any palette/overlay left by a previous test (shared host session). */
async function settle(page: Page): Promise<void> {
  await page.locator("#terminal").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

/** Loads the page, waits for the song, then clears leftover UI state. */
async function loadAndSettle(page: Page): Promise<void> {
  await page.goto("/");
  await waitForSong(page);
  await settle(page);
}

test("loads the web TUI frame with no page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("#terminal .xterm")).toBeVisible();
  await expect(page.locator("#shell-buttons button")).toHaveCount(9);
  await waitForSong(page);

  expect(errors).toEqual([]);
});

test("accepts typed slash commands", async ({ page }) => {
  await loadAndSettle(page);

  await page.keyboard.type("/info");
  await page.keyboard.press("Enter");

  await expect
    .poll(() => screenText(page), { timeout: 10_000 })
    .toContain("John Oestmann");
});

test("shell buttons drive the shared command surface", async ({ page }) => {
  await loadAndSettle(page);

  await page.getByRole("button", { name: "Help" }).click();
  await expect
    .poll(() => screenText(page), { timeout: 10_000 })
    .toContain("SpectralPrism Tracker commands");
});

test("renders aligned terminal rows with the version header", async ({
  page,
}) => {
  await loadAndSettle(page);
  const text = await screenText(page);
  const lines = text.split("\n");
  expect(lines[0]).toContain("SPECTRALPRISM TRACKER v");
  // Every tracker body row must place its channel separators in the same
  // columns, i.e. no row drifted by a partial cell (FEAT-154). Use the first
  // three `│` so the Explainer panel's border columns don't interfere.
  const trackerSeparators = lines
    .map((line) => {
      const positions = [...line]
        .map((char, index) => (char === "│" ? index : -1))
        .filter((index) => index >= 0)
        .slice(0, 3);
      return positions.length === 3 ? positions.join(",") : null;
    })
    .filter((value): value is string => value !== null);
  expect(trackerSeparators.length).toBeGreaterThan(2);
  expect(new Set(trackerSeparators).size).toBe(1);
});

test("reflows on resize", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadAndSettle(page);

  await page.setViewportSize({ width: 700, height: 500 });
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(500);

  expect(errors).toEqual([]);
  expect(await screenText(page)).toContain("aleph_lab01");
});
