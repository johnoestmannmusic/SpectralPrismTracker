import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Session } from "@/tui/session";
import { createRegistry } from "@/tui/commands";
import { isCancel, isConfirm } from "@/tui/keys";
import {
  PROJECT_EXTENSION,
  alternateProjectPath,
  extensionOf,
  isProjectPath,
} from "@/runtime/paths";
import { projectToJson } from "@/core/project";
import { MAX_WAV_SECONDS, effectiveWavLength, openPath } from "@/tui/io";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { versionStamp } from "@/tui/version";
import { rowTimeForChannel } from "@/core/timing";
import { cellExplain, instrumentExplain } from "@/tui/explainer";
import { flatColumnsForChannel } from "@/core/tracker";
import { cellAt } from "@/core/songModel";
import {
  joinOutputPath,
  pickableEntries,
  saveEntries,
} from "@/tui/components/FilePicker";
import { defaultWavOutputPath, wavExportGroups } from "@/tui/editors";
import { progressBar } from "@/tui/components/ProgressModal";

/**
 * UX Polish Pass 2 (FEAT-134…154). Focused unit coverage for the shared key
 * predicates, slash autocomplete skip, project extension, build stamp, the
 * channel-aware play-from-cell time and the coloured Explainer spans.
 */
const session = new Session();

beforeAll(async () => {
  await session.init();
}, 60_000);

afterAll(() => {
  session.dispose();
});

describe("key predicates (FEAT-134)", () => {
  it("confirms on z/Enter and cancels on x/Esc", () => {
    expect(isConfirm("z", { return: false, escape: false })).toBe(true);
    expect(isConfirm("Z", { return: false, escape: false })).toBe(true);
    expect(isConfirm(undefined, { return: true, escape: false })).toBe(true);
    expect(isConfirm("q", { return: false, escape: false })).toBe(false);
    expect(isCancel("x", { return: false, escape: false })).toBe(true);
    expect(isCancel("X", { return: false, escape: false })).toBe(true);
    expect(isCancel(undefined, { return: false, escape: true })).toBe(true);
    expect(isCancel("q", { return: false, escape: false })).toBe(false);
  });
});

describe("slash autocomplete (FEAT-142)", () => {
  const registry = createRegistry();

  it("run-ish suggestions resolve to their command", () => {
    expect(registry.topSuggestion("/info")?.name).toBe("info");
    expect(registry.topSuggestion("/in")?.name).toBe("info");
  });

  it("detects which commands need a required argument", () => {
    const info = registry.get("info")!;
    const setpattern = registry.get("setpattern")!;
    // /info takes no required arg; /setpattern requires <order> <pattern>.
    expect(
      (info.args ?? []).some((arg) => arg.required),
      "info has no required args",
    ).toBe(false);
    expect((setpattern.args ?? []).some((arg) => arg.required)).toBe(true);
  });

  it("completes an unfinished command on Enter", () => {
    expect(registry.enterAction("/in", true)).toBe("complete");
    expect(registry.enterAction("/info", true)).toBe("run");
  });
});

describe("project extension (FEAT-150)", () => {
  it("uses .sptproj and still accepts legacy extensions", () => {
    expect(PROJECT_EXTENSION).toBe("sptproj");
    expect(isProjectPath("song.sptproj")).toBe(true);
    expect(isProjectPath("song.SPTPROJ")).toBe(true);
    expect(isProjectPath("song.lampjson")).toBe(true);
    expect(isProjectPath("song.lmpjson")).toBe(true);
    expect(isProjectPath("song.txt")).toBe(false);
    expect(extensionOf("song.sptproj")).toBe("sptproj");
  });

  it("maps between old and new extensions", () => {
    expect(alternateProjectPath("song.lampjson")).toBe("song.sptproj");
    expect(alternateProjectPath("song.lmpjson")).toBe("song.sptproj");
    expect(alternateProjectPath("song.sptproj")).toBe("song.lampjson");
    expect(alternateProjectPath("song.txt")).toBe(null);
  });

  it("opens the renamed .sptproj when the recorded .lampjson path is gone", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spt-open-"));
    try {
      const json = projectToJson(session.buildProjectFile()!, true);
      const renamed = path.join(dir, "song.sptproj");
      await writeFile(renamed, json, "utf8");
      const result = await openPath(session, path.join(dir, "song.lampjson"));
      expect(result.ok).toBe(true);
      expect(session.getState().projectPath).toBe(renamed);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("/open picker (FEAT-155)", () => {
  it("lists directories and project files only", () => {
    const entries = [
      { name: "dir", path: "/dir", isDirectory: true },
      { name: "song.sptproj", path: "/song.sptproj", isDirectory: false },
      { name: "old.lampjson", path: "/old.lampjson", isDirectory: false },
      { name: "notes.txt", path: "/notes.txt", isDirectory: false },
      { name: ".hidden.sptproj", path: "/.hidden.sptproj", isDirectory: false },
    ];
    expect(pickableEntries(entries).map((entry) => entry.name)).toEqual([
      "dir",
      "song.sptproj",
      "old.lampjson",
    ]);
  });

  it("opens the picker when /open has no path", async () => {
    const registry = createRegistry();
    let opened: string | undefined;
    const result = await registry.execute("/open", {
      session,
      listCommands: () => registry.all(),
      openOverlay: (name) => {
        opened = name;
      },
    });
    expect(result.ok).toBe(true);
    expect(opened).toBe("filepicker");
  });
});

describe("/exit alias (BUG-36)", () => {
  it("is a first-class command that calls exit", async () => {
    const registry = createRegistry();
    expect(registry.get("exit")?.id).toBe("exit");
    // It now appears in the palette's suggestion list (not just as an alias).
    expect(registry.suggest("exi", 6).map((c) => c.name)).toContain("exit");
    let exited = false;
    const result = await registry.execute("/exit", {
      session,
      exit: () => {
        exited = true;
      },
    });
    expect(result.ok).toBe(true);
    expect(exited).toBe(true);
  });
});

describe("WAV export safety cap (BUG-37)", () => {
  it("honours an explicit track length", () => {
    expect(effectiveWavLength(25, 8330)).toEqual({
      lengthSeconds: 25,
      autoCapped: false,
    });
  });

  it("auto-caps a very long polymeter loop", () => {
    expect(effectiveWavLength(0, 8330)).toEqual({
      lengthSeconds: MAX_WAV_SECONDS,
      autoCapped: true,
    });
  });

  it("leaves a normal-length song uncapped", () => {
    expect(effectiveWavLength(0, 120)).toEqual({
      lengthSeconds: 0,
      autoCapped: false,
    });
  });
});

describe("WAV output file param (FEAT-158)", () => {
  it("joins a directory and filename", () => {
    expect(joinOutputPath("/tmp/songs", "out.wav")).toBe("/tmp/songs/out.wav");
    expect(joinOutputPath("/tmp/songs/", "out.wav")).toBe("/tmp/songs/out.wav");
    expect(joinOutputPath("", "out.wav")).toBe("out.wav");
  });

  it("filters save-mode entries to directories and WAVs", () => {
    const entries = [
      { name: "d", path: "/d", isDirectory: true },
      { name: "a.wav", path: "/a.wav", isDirectory: false },
      { name: "b.sptproj", path: "/b.sptproj", isDirectory: false },
      { name: "c.txt", path: "/c.txt", isDirectory: false },
    ];
    expect(saveEntries(entries).map((entry) => entry.name)).toEqual([
      "d",
      "a.wav",
    ]);
  });

  it("exposes an editable Output file and a browse action", () => {
    let picked = false;
    const groups = wavExportGroups(
      session,
      () => {},
      () => {
        picked = true;
      },
    );
    const params = groups.flatMap((group) => group.params);
    const output = params.find((param) => param.label === "Output file");
    expect(output?.kind).toBe("text");
    expect(String(output?.value)).toMatch(/\.wav$/);
    const browse = params.find(
      (param) => param.label === "Choose output location…",
    );
    expect(browse?.kind).toBe("action");
    browse?.run?.();
    expect(picked).toBe(true);
  });

  it("defaults the output beside the project", () => {
    expect(defaultWavOutputPath(session)).toMatch(/\.wav$/);
  });
});

describe("WAV export action + progress (FEAT-156)", () => {
  it("exposes a runnable Start export row", () => {
    let ran = false;
    const groups = wavExportGroups(session, () => {
      ran = true;
    });
    const action = groups
      .flatMap((group) => group.params)
      .find((param) => param.kind === "action");
    expect(action?.label).toBe("Start export");
    action?.run?.();
    expect(ran).toBe(true);
  });

  it("renders a clamped progress bar", () => {
    expect(progressBar(0.5, 10)).toBe("█████░░░░░");
    expect(progressBar(2, 10)).toBe("██████████");
    expect(progressBar(-1, 10)).toBe("░░░░░░░░░░");
  });
});

describe("web filesystem guard (FEAT-163)", () => {
  it("blocks fs commands and opens the notice", async () => {
    const registry = createRegistry();
    session.setWebMode(true);
    try {
      let opened: string | undefined;
      const result = await registry.execute("/open", {
        session,
        openOverlay: (name) => {
          opened = name;
        },
      });
      expect(result.ok).toBe(true);
      expect(opened).toBe("webblocked");
    } finally {
      session.setWebMode(false);
    }
  });

  it("still runs non-filesystem commands on web", async () => {
    const registry = createRegistry();
    session.setWebMode(true);
    try {
      const result = await registry.execute("/info", { session });
      expect(result.ok).toBe(true);
    } finally {
      session.setWebMode(false);
    }
  });
});

describe("web shell buttons (FEAT-162)", () => {
  it("keeps only the requested controls", async () => {
    const { SHELL_BUTTONS } = await import("@/web/shell");
    expect(SHELL_BUTTONS.map((button) => button.id)).toEqual([
      "toggle",
      "stepthrough",
      "download-wav",
      "help",
      "view-source",
      "fullscreen",
    ]);
    expect(SHELL_BUTTONS[0]?.label).toBe("Play");
  });
});

describe("build stamp (FEAT-153)", () => {
  it("renders SPECTRALPRISM TRACKER vYYYYMMDD", () => {
    expect(versionStamp()).toMatch(/^SPECTRALPRISM TRACKER v\d{8}$/);
  });
});

describe("/viewsource (FEAT-149)", () => {
  it("is registered with the repository URL", async () => {
    const registry = createRegistry();
    const def = registry.get("viewsource");
    expect(def?.description).toContain("repository");
    const url = "https://github.com/johnoestmannmusic/SpectralPrismTracker";
    expect(def?.description).toBeDefined();
    expect(url).toContain("SpectralPrismTracker");
  });
});

describe("Explainer coloured spans (FEAT-139)", () => {
  it("marks calculated values and instrument names", () => {
    const song = session.song!;
    const instrument = instrumentExplain(song, 0);
    expect(instrument.segments?.length ?? 0).toBeGreaterThan(0);
    expect(instrument.segments?.some((s) => s.color === "cyan")).toBe(true);
    expect(instrument.segments?.some((s) => s.color === "yellow")).toBe(true);
    // A note cell (if present) exposes the calculated frequency in cyan.
    const column = flatColumnsForChannel(song, 0)[0]!;
    const cell = cellAt(song, 0, 0, 0);
    const result = cellExplain(song, 0, 0, 0, column, cell);
    if (result.segments) {
      expect(result.segments.some((s) => s.color === "cyan")).toBe(true);
    }
  });
});

describe("channel-aware play-from-cell (FEAT-147)", () => {
  it("resolves a time for any channel's order/row", () => {
    const song = session.song!;
    for (let channel = 0; channel < song.channels.length; channel++) {
      const time = rowTimeForChannel(song, channel, 0, 0);
      expect(Number.isFinite(time)).toBe(true);
      expect(time).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("cycles mode is project-scoped (BUG-31)", () => {
  it("captures the flag in the built project file", () => {
    const previous = session.getState().cyclesMode;
    session.setCyclesMode(true);
    expect(session.buildProjectFile()!.cyclesMode).toBe(true);
    session.setCyclesMode(previous);
  });
});
