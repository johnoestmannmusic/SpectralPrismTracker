import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

const projectRoot = path.resolve(__dirname, "../..");

test("EDIT MODE: select cells, navigate with arrows, and edit", async () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "lantern-edit-"));
  const app = await electron.launch({
    args: [projectRoot, "--no-sandbox", `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
  });
  try {
    const window = await app.firstWindow();
    await window.waitForSelector(".tracker tbody tr");
    await expect(window.locator(".toolbar .status")).toContainText("flight_school_night_shift", {
      timeout: 30_000,
    });

    // Enter EDIT MODE.
    await window.getByRole("button", { name: "EDIT MODE" }).click();
    await expect(window.getByRole("button", { name: "Pattern Manager" })).toBeVisible();

    // Click the first channel's NOTE cell on row 0.
    const noteCell = window.locator(".tracker tbody tr").first().locator("td").nth(1);
    await noteCell.click();

    const selected = window.locator(".tracker-cell.selected");
    await expect(selected).toHaveCount(1);

    // Read the selection's row before/after ArrowDown.
    const selectedRowBefore = await window.evaluate(() => {
      const el = document.querySelector(".tracker-cell.selected");
      return el ? (el.closest("tr")?.textContent ?? "") : "";
    });
    await window.keyboard.press("ArrowDown");
    const selectedRowAfter = await window.evaluate(() => {
      const el = document.querySelector(".tracker-cell.selected");
      return el ? (el.closest("tr")?.textContent ?? "") : "";
    });
    expect(selectedRowAfter).not.toBe(selectedRowBefore);

    // Edit: enter a Note Off (C) into the selected NOTE cell and confirm it renders.
    await window.keyboard.press("c");
    await expect(window.locator(".tracker-cell.selected")).toContainText(/OFF/);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
