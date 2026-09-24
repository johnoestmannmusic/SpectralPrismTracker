import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyBuildStep,
  blankTargetFrom,
  buildSteps,
  cloneTarget,
  type BuildTarget,
} from "@/core/stepthrough";
import { defaultMasterFx } from "@/core/masterFx";
import { defaultProject } from "@/core/project";
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
    const blank = blankTargetFrom(target);
    // The blank start has no pattern content and default instrument settings.
    expect(blank.settings.every((s) => s.sourceIndex === null)).toBe(true);
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
    // Pattern cells are reproduced.
    const patternStep = buildSteps(target).find(
      (step) => step.action.kind === "patternCell",
    );
    if (patternStep && patternStep.action.kind === "patternCell") {
      expect(
        cellAt(
          blank.song,
          patternStep.action.channel,
          patternStep.action.order,
          patternStep.action.row,
        ),
      ).toEqual(patternStep.action.cell);
    }
  });

  it("names FX effects in pattern steps", () => {
    const target = session.snapshotTarget()!;
    const channel = target.song.channels[0]!;
    const pattern = channel.patterns.get(channel.orderList[0]!)!;
    pattern.rows[0]!.effects[0] = { effect: 0x01, value: 0x20 };
    const step = buildSteps(target).find(
      (candidate) => candidate.id === "pattern.0.0.0",
    );
    expect(step?.title).toContain("01 - Pitch slide up");
  });

  it("round-trips BPM/highlights and reproduces row timing", () => {
    const target = session.snapshotTarget()!;
    const blank = blankTargetFrom(target);
    const timing = buildSteps(target).find(
      (step) => step.action.kind === "timing",
    );
    expect(timing).toBeTruthy();
    if (timing?.action.kind === "timing") {
      expect(timing.action.bpm).toBe(target.project.bpmOverride);
    }
    for (const step of buildSteps(target)) applyBuildStep(blank, step);
    expect(blank.project.bpmOverride).toBe(target.project.bpmOverride);
    expect(blank.song.meta.highlightA).toBe(target.song.meta.highlightA);
    expect(blank.song.meta.highlightB).toBe(target.song.meta.highlightB);
    expect(blank.song.rowTimes).toEqual(target.song.rowTimes);
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

  it("does not audition an OFF pattern step", async () => {
    const target = session.snapshotTarget();
    expect(target).not.toBeNull();
    const steps = buildSteps(target!);
    // Pick an OFF step that still resolves to a held instrument — the case that
    // used to fall through to the full-instrument preview.
    const offStep = steps.find((step) => {
      if (step.action.kind !== "patternCell") return false;
      if (step.action.cell.note?.kind !== "off") return false;
      const action = step.action;
      const channel = target!.song.channels[action.channel];
      const resolved =
        (step as { instrument?: number }).instrument ??
        action.cell.instrument ??
        channel?.insTimeline[action.order]?.[action.row] ??
        null;
      return resolved !== null;
    });
    expect(offStep).toBeDefined();

    const backend = session.backend;
    expect(backend).not.toBeNull();
    const previewPattern = vi.spyOn(backend!, "previewPattern");
    const preview = vi.spyOn(backend!, "preview");
    // Force the Spectral path to look render-ready so the old fall-through
    // (the bug) would have called preview() for the held instrument.
    const fusionReady = vi.spyOn(backend!, "fusionReady").mockReturnValue(true);
    const fusionRendering = vi
      .spyOn(backend!, "fusionRendering")
      .mockReturnValue(false);
    try {
      await session.previewBuildStep(target!, offStep!);
      // Off is silence: neither the row nor the bare instrument may sound.
      expect(previewPattern).not.toHaveBeenCalled();
      expect(preview).not.toHaveBeenCalled();
    } finally {
      previewPattern.mockRestore();
      preview.mockRestore();
      fusionReady.mockRestore();
      fusionRendering.mockRestore();
    }
  });

  it("blanks every pattern cell while keeping the song structure", () => {
    const target = session.snapshotTarget();
    expect(target).not.toBeNull();
    const blank = blankTargetFrom(target!);

    // Structure is preserved, values are reset.
    expect(blank.song.meta.orderLength).toBe(target!.song.meta.orderLength);
    expect(blank.song.channels).toHaveLength(target!.song.channels.length);
    expect(blank.project.songTitle).toBe("");
    expect(blank.project.bpmOverride).toBeNull();
    expect(blank.song.instruments[0]!.name).toBe("Instrument 00");

    let cells = 0;
    for (const channel of blank.song.channels) {
      for (const pattern of channel.patterns.values()) {
        for (const row of pattern.rows) {
          cells += 1;
          expect(row.note).toBeNull();
          expect(row.instrument).toBeNull();
          expect(row.volume).toBeNull();
          for (const effect of row.effects) {
            expect(effect.effect).toBeNull();
            expect(effect.value).toBeNull();
          }
        }
      }
      // Timelines are rebuilt, not left stale by the faster blanking pass.
      expect(Array.isArray(channel.insTimeline)).toBe(true);
    }
    expect(cells).toBeGreaterThan(0);
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
