import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");

test("loads the bundled song and renders the player shell", async () => {
  const app = await electron.launch({
    args: [projectRoot, "--no-sandbox"],
    cwd: projectRoot,
  });

  const window = await app.firstWindow();
  await window.waitForSelector(".app-header h1");

  await expect(window.locator(".app-header h1")).toHaveText("Lantern Music Player");
  // The status line is set only after the .fur parses and the project loads.
  await expect(window.locator(".app-header .status")).toContainText(
    "flight_school_night_shift",
    {
      timeout: 30_000,
    },
  );

  // Transport, mixer and tracker all render.
  await expect(window.getByRole("button", { name: /Play/ })).toBeVisible();
  await expect(window.locator("h2", { hasText: "MIXER" })).toBeVisible();
  await expect(window.locator(".tracker")).toBeVisible();

  // The tracker shows the fixture's first row (Bass 1 note on channel 0).
  await expect(window.locator(".tracker tbody tr").first()).toBeVisible();

  await app.close();
});
