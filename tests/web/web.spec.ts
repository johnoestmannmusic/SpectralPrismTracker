import { expect, test, type Page } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:8123";

/** Reads the rendered xterm screen buffer via the app's test hook. */
async function screenText(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __lanternScreenText?: () => string }
      ).__lanternScreenText?.() ?? "",
  );
}

/** Waits until the bundled project has loaded into this page's session. */
async function waitForSong(page: Page): Promise<void> {
  await expect(page.locator("#shell-status")).not.toHaveText("Loading…", {
    timeout: 20_000,
  });
  await expect
    .poll(() => screenText(page), { timeout: 20_000 })
    .toContain("HYPERMART02");
}

/** Clears any overlay left on this visitor's own instance. */
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
  await expect(page.locator("#shell-buttons button")).toHaveCount(6);
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

test("shell buttons drive the local command surface", async ({ page }) => {
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

test("renders colour and cell highlighting", async ({ page }) => {
  // Firefox/Safari expose neither `userAgentData` nor a Chrome UA token, which
  // made chalk's browser colour detector resolve level 0 and strip every Ink
  // colour/background (BUG-51). Run under a Safari-like UA so the regression
  // is actually covered.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      configurable: true,
    });
  });
  await page.goto("/");
  await waitForSong(page);
  await settle(page);

  const palette = await page.evaluate(() => {
    const spans = [...document.querySelectorAll(".xterm-rows span")];
    const foreground = new Set<string>();
    const background = new Set<string>();
    for (const span of spans) {
      const style = getComputedStyle(span);
      if (style.color) foreground.add(style.color);
      if (
        style.backgroundColor &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)"
      ) {
        background.add(style.backgroundColor);
      }
    }
    return { foreground: foreground.size, background: background.size };
  });

  expect(palette.foreground).toBeGreaterThan(3);
  expect(palette.background).toBeGreaterThan(2);
});

test("blocks filesystem commands with the web notice", async ({ page }) => {
  await loadAndSettle(page);
  await page.keyboard.type("/open");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => screenText(page), { timeout: 10_000 })
    .toContain("Not available in the web version");
  await expect(screenText(page)).resolves.toContain(
    "github.com/johnoestmannmusic/SpectralPrismTracker",
  );
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
  expect(await screenText(page)).toContain("HYPERMART02");
});

test("serves no shared terminal: each visitor is independent (HC005)", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL });
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // A shared server would expose /api/* endpoints; a static build must not.
  const apiRequests: string[] = [];
  for (const page of [pageA, pageB]) {
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(request.url());
    });
  }

  try {
    await Promise.all([pageA.goto("/"), pageB.goto("/")]);
    await Promise.all([waitForSong(pageA), waitForSong(pageB)]);

    // Visitor A opens Help; visitor B must see nothing of it.
    await pageA.getByRole("button", { name: "Help" }).click();
    await expect
      .poll(() => screenText(pageA), { timeout: 10_000 })
      .toContain("SpectralPrism Tracker commands");
    expect(await screenText(pageB)).not.toContain(
      "SpectralPrism Tracker commands",
    );

    expect(apiRequests).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/** Reads the size of this visitor's OPFS autosave backup (0 when absent). */
async function backupSize(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle("backup.sptproj");
      return (await handle.getFile()).size;
    } catch {
      return 0;
    }
  });
}

test("persists an OPFS autosave backup in the visitor's browser", async ({
  page,
}) => {
  await page.goto("/");
  await waitForSong(page);

  // Autosave fires every 15 mutating actions; `z` writes the last value/note.
  await page.locator("#terminal").click();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("z");
    await page.waitForTimeout(30);
  }

  await expect
    .poll(() => backupSize(page), { timeout: 10_000 })
    .toBeGreaterThan(0);
});

test("restores the visitor's own autosave after a reload", async ({ page }) => {
  await page.goto("/");
  await waitForSong(page);
  await page.locator("#terminal").click();

  // 15 `/clearall` mutations fire the autosave hook.
  for (let i = 0; i < 15; i += 1) {
    await page.keyboard.type("/clearall");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(40);
  }
  await expect
    .poll(() => backupSize(page), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.reload();
  await waitForSong(page);
  // The demo's first pattern note is gone: the cleared project was restored.
  expect(await screenText(page)).not.toContain("C-7 02");
});
