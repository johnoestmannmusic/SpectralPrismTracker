import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyBuildStep,
  buildSteps,
  cloneTarget,
  type BuildTarget,
} from "@/core/stepthrough";
import { defaultMasterFx } from "@/core/masterFx";
import { defaultProject } from "@/core/project";
import { defaultSamplerSettings } from "@/core/sampler";
import { buildSongModelFromProject, cellAt } from "@/core/songModel";
import { Session } from "@/tui/session";

function blankTarget(): BuildTarget {
  const project = defaultProject();
  return {
    project,
    song: buildSongModelFromProject(project),
    settings: [],
    channelVolume: [1, 1, 1, 1],
    channelMuted: [false, false, false, false],
    masterVolume: 1,
    masterFx: defaultMasterFx(),
  };
}

describe("stepthrough generator", () => {
  const session = new Session();

  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("emits nothing for a default (empty) target", () => {
    expect(buildSteps(blankTarget())).toHaveLength(0);
  });

  it("builds a stable, unique recipe for the bundled project", () => {
    const target = session.snapshotTarget()!;
    const steps = buildSteps(target);
    expect(steps.length).toBeGreaterThan(0);
    const ids = steps.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
      expect(step.highlights.length).toBeGreaterThan(0);
    }
  });

  it("round-trips a default project through its own recipe", () => {
    const target = session.snapshotTarget()!;
    const blank = blankTarget();
    // Give the blank target the same instrument slots so instrument steps apply.
    blank.settings = target.settings.map(() => defaultSamplerSettings());
    for (const step of buildSteps(target)) applyBuildStep(blank, step);

    expect(blank.project.songTitle).toBe(target.project.songTitle);
    expect(blank.masterVolume).toBeCloseTo(target.masterVolume);
    expect(blank.masterFx).toEqual(target.masterFx);
    expect(blank.settings.length).toBe(target.settings.length);
    // Spot-check an instrument that has non-default sampler values.
    const index = target.settings.findIndex(
      (setting) => setting.sourceIndex !== null,
    );
    if (index >= 0)
      expect(blank.settings[index]!.sourceIndex).toBe(
        target.settings[index]!.sourceIndex,
      );
  });

  it("applies a pattern-cell step to the target song", () => {
    const target = session.snapshotTarget()!;
    const step = buildSteps(target).find(
      (candidate) => candidate.action.kind === "patternCell",
    );
    expect(step).toBeTruthy();
    if (!step || step.action.kind !== "patternCell") return;
    const clone = cloneTarget(target);
    applyBuildStep(clone, step);
    const cell = cellAt(
      clone.song,
      step.action.channel,
      step.action.order,
      step.action.row,
    );
    expect(cell).toEqual(step.action.cell);
  });

  it("exports the recipe as JSON", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const nodePath = await import("node:path");
    const { exportStepRecipe } = await import("@/tui/io");
    const dir = await mkdtemp(nodePath.join(tmpdir(), "lantern-steps-"));
    try {
      const target = nodePath.join(dir, "recipe.json");
      const result = await exportStepRecipe(session, target);
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(await readFile(target, "utf8")) as {
        steps: unknown[];
      };
      expect(parsed.steps.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
