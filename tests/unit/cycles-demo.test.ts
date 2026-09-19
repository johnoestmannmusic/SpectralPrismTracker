import { describe, expect, it } from "vitest";
import { projectFromJson } from "@/core/project";
import { buildSongModelFromProject } from "@/core/songModel";
import { songLoopRows } from "@/core/layout";
import { sequenceFromSong } from "@/core/sampler";
import {
  applyBuildStep,
  blankTargetFrom,
  buildSteps,
  type BuildTarget,
} from "@/core/stepthrough";
import { fixtureText } from "./fixtures";

function demoProject() {
  return projectFromJson(fixtureText("examples/cycles-demo.sptproj"));
}

function demoTarget(project: ReturnType<typeof demoProject>): BuildTarget {
  return {
    project,
    song: buildSongModelFromProject(project),
    settings: project.instruments,
    channelVolume: project.channelVolume,
    channelMuted: project.mutedChannels,
    masterVolume: project.masterVolume,
    masterFx: project.masterFx,
  };
}

describe("bundled Cycles demo", () => {
  it("has independent per-channel order lengths and an LCM loop", () => {
    const project = demoProject();
    const song = buildSongModelFromProject(project);
    expect(song.channels.map((channel) => channel.orderLength)).toEqual([
      2, 3, 4, 5,
    ]);
    // Cycle rows: 16, 24, 32, 40 -> LCM 480.
    expect(songLoopRows(song)).toBe(480);
    expect(song.rowTimes.length).toBe(481);
  });

  it("enables the Chord and MicroTextures stages", () => {
    const project = demoProject();
    expect(project.instruments[1]!.chord.enabled).toBe(true);
    expect(project.instruments[1]!.chord.preset).toBe("major7");
    expect(project.instruments[2]!.spectral.microTextures.enabled).toBe(true);
    expect(
      project.instruments[2]!.spectral.microTextures.grainChaos,
    ).toBeGreaterThan(0);
  });

  it("carries glitch FX and per-channel phasing into the sequence", () => {
    const project = demoProject();
    const song = buildSongModelFromProject(project);
    const sequence = sequenceFromSong(song, project.instruments);
    const notes = sequence.rows.flat().filter((event) => event.type === "note");
    expect(notes.length).toBeGreaterThan(0);
    // 12xx reverse on channel 3, 11xx ratchet on channel 0.
    expect(notes.some((event) => event.reverse)).toBe(true);
    expect(notes.some((event) => (event.delaySec ?? 0) > 0)).toBe(true);
    // Per-channel tape drift on channel 0.
    expect(notes.some((event) => (event.detuneCents ?? 0) !== 0)).toBe(true);
  });

  it("generates stepthrough steps for the Cycles features", () => {
    const target = demoTarget(demoProject());
    const steps = buildSteps(target);
    const ids = steps.map((step) => step.id);
    expect(ids).toContain("instrument.1.chord.enabled");
    expect(ids).toContain("instrument.2.micro.enabled");
    expect(steps.some((step) => step.screen === "chord")).toBe(true);
    expect(steps.some((step) => step.screen === "microtextures")).toBe(true);
    expect(steps.some((step) => step.action.kind === "channelParam")).toBe(
      true,
    );

    // Replaying the recipe onto a blank target restores the channel lengths.
    const blank = blankTargetFrom(target);
    for (const step of steps) applyBuildStep(blank, step);
    expect(blank.song.channels.map((channel) => channel.orderLength)).toEqual([
      2, 3, 4, 5,
    ]);
  });
});
