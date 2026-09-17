import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const projectRoot = path.resolve(__dirname, "../..");

test("Sampler/Spectral modal shows waveforms and closes", async () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "lantern-editor-"));
  const app = await electron.launch({
    args: [projectRoot, "--no-sandbox", `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
  });
  try {
    const window = await app.firstWindow();
    await expect(window.locator(".toolbar .status")).toContainText(
      "instruments",
      {
        timeout: 30_000,
      },
    );

    // Open instrument 0's Sampler editor via its pill.
    await window
      .locator(".instrument-row")
      .first()
      .getByRole("button", { name: "Sampler" })
      .click();
    const modal = window.locator(".floating-window");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".waveform canvas").first()).toBeVisible();
    // ADSR graph canvas (draggable points) on the Sampler tab.
    await expect(modal.locator("canvas.adsr-canvas")).toBeVisible();

    // Switch to the Spectral tab: Sample A + Result waveforms must render.
    await modal.getByRole("button", { name: "Spectral" }).click();
    await expect(modal.locator("h3", { hasText: "Result" })).toBeVisible();
    await expect(modal.locator(".waveform canvas").first()).toBeVisible();

    // The close button must actually close the window (drag capture regression).
    await modal.locator(".close-btn").click();
    await expect(window.locator(".floating-window")).toHaveCount(0);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("Spectral modulation route bakes into the rendered result", async () => {
  const userDataDir = mkdtempSync(
    path.join(os.tmpdir(), "lantern-modulation-"),
  );
  const app = await electron.launch({
    args: [projectRoot, "--no-sandbox", `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
  });
  try {
    const window = await app.firstWindow();
    const pageErrors: string[] = [];
    window.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    window.on("pageerror", (error) => pageErrors.push(String(error)));

    await expect(window.locator(".toolbar .status")).toContainText(
      "instruments",
      {
        timeout: 30_000,
      },
    );

    // Load a project whose first instrument has Sample A assigned and Spectral
    // enabled, so a fused loop renders automatically once the worker is warm.
    const projectFile = path.join(userDataDir, "modulation.lampjson");
    writeFileSync(
      projectFile,
      readFileSync(
        path.join(projectRoot, "assets/lmp-default-proj.lampjson"),
        "utf8",
      ),
    );
    await window.getByRole("button", { name: "Project JSON" }).click();
    await window
      .locator('.modal input[type="file"]')
      .setInputFiles(projectFile);
    await expect(window.locator(".modal")).toHaveCount(0);

    // Instrument 0 now has Sample A assigned and Spectral enabled.
    await window
      .locator(".instrument-row")
      .first()
      .getByRole("button", { name: "Sampler" })
      .click();
    const modal = window.locator(".floating-window");
    await modal.getByRole("button", { name: "Spectral" }).click();
    const spectralTab = modal.locator(".editor-tab");
    const statusHint = spectralTab.locator("p.hint").first();
    await expect(statusHint).toContainText("Rendered result is ready.", {
      timeout: 30_000,
    });

    const resultWave = spectralTab.locator(".waveform canvas").last();
    const beforeRender = await resultWave.screenshot();

    // Add an offline modulation route; the result must re-render automatically.
    await spectralTab
      .getByRole("button", { name: "+ Add modulation route" })
      .click();
    await expect(spectralTab.locator(".mod-route")).toHaveCount(1);
    await expect(spectralTab.locator(".mod-route")).toContainText("range");
    await expect(statusHint).toContainText("Rendered result is ready.", {
      timeout: 30_000,
    });

    // The route is baked into the rendered waveform, not just the UI.
    const afterRender = await resultWave.screenshot();
    expect(afterRender.equals(beforeRender)).toBe(false);

    // Route state survives a tab switch (it lives in project settings).
    await modal.getByRole("button", { name: "Sampler", exact: true }).click();
    await modal.getByRole("button", { name: "Spectral" }).click();
    await expect(spectralTab.locator(".mod-route")).toHaveCount(1);

    expect(pageErrors).toEqual([]);
    await modal.locator(".close-btn").click();
    await expect(window.locator(".floating-window")).toHaveCount(0);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("Percussion post-stage renders a one-shot after Fusion", async () => {
  const userDataDir = mkdtempSync(
    path.join(os.tmpdir(), "lantern-percussion-"),
  );
  const app = await electron.launch({
    args: [projectRoot, "--no-sandbox", `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
  });
  try {
    const window = await app.firstWindow();
    const pageErrors: string[] = [];
    window.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    window.on("pageerror", (error) => pageErrors.push(String(error)));

    await expect(window.locator(".toolbar .status")).toContainText(
      "instruments",
      {
        timeout: 30_000,
      },
    );
    const projectFile = path.join(userDataDir, "percussion.lampjson");
    writeFileSync(
      projectFile,
      readFileSync(
        path.join(projectRoot, "assets/lmp-default-proj.lampjson"),
        "utf8",
      ),
    );
    await window.getByRole("button", { name: "Project JSON" }).click();
    await window
      .locator('.modal input[type="file"]')
      .setInputFiles(projectFile);
    await expect(window.locator(".modal")).toHaveCount(0);

    await window
      .locator(".instrument-row")
      .first()
      .getByRole("button", { name: "Sampler" })
      .click();
    const modal = window.locator(".floating-window");
    await modal.getByRole("button", { name: "Spectral" }).click();
    const spectralTab = modal.locator(".editor-tab");
    const statusHint = spectralTab.locator("p.hint").first();
    await expect(statusHint).toContainText("Rendered result is ready.", {
      timeout: 30_000,
    });

    // The percussion section is the third pipeline step, after Fusion.
    await expect(spectralTab.locator(".percussion h3")).toContainText(
      "after Fusion",
    );
    await spectralTab.getByRole("button", { name: "Kick" }).click();
    await expect(spectralTab.locator(".percussion-canvas")).toBeVisible();
    // Primary controls are exposed up front...
    for (const label of ["Punch (%)", "Drive (%)", "Compression (%)"]) {
      await expect(
        spectralTab.locator(".percussion .slider", { hasText: label }),
      ).toBeVisible();
    }
    // ...and the rest sit behind the Advanced disclosure.
    await spectralTab.locator(".percussion-advanced summary").click();
    for (const label of ["Pitch Start (st)", "Partials"]) {
      await expect(
        spectralTab.locator(".percussion-advanced .slider", { hasText: label }),
      ).toBeVisible();
    }
    await expect(statusHint).toContainText("Rendered result is ready.", {
      timeout: 30_000,
    });

    // Releasing a percussion parameter slider auditions the freshly rendered
    // one-shot (no scrolling back to the Preview button). Pressing End on the
    // Length slider sets a 2s hit, long enough to observe the playing state.
    const lengthSlider = spectralTab
      .locator('.percussion .slider', { hasText: 'Length (s)' })
      .locator('input[type="range"]');
    await lengthSlider.focus();
    await lengthSlider.press('End');
    await expect(
      modal.getByRole('button', { name: 'Stop Preview' }),
    ).toBeVisible({ timeout: 30_000 });

    // A rendered non-empty result waveform exists for the one-shot.
    const resultWave = spectralTab.locator(".waveform canvas").last();
    await expect(resultWave).toBeVisible();
    const rendered = await resultWave.screenshot();
    expect(rendered.length).toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
    await modal.locator(".close-btn").click();
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
