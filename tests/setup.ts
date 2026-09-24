import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setHost, type Host } from "@/host";
import { nodeHost } from "@/host/node";

// Tests run in Node: install the Node host so `new Session()` works exactly as
// the desktop entrypoint does. Point the shared host at a throwaway config path
// so session writes (last project, cyclesMode, autosave) never touch the
// developer's real `~/.config/lantern`.
process.env.LANTERN_CONFIG = path.join(
  mkdtempSync(path.join(tmpdir(), "lantern-test-")),
  "config.json",
);

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const testProject = path.join(
  projectRoot,
  "tests",
  "fixtures",
  "test-song.sptproj",
);
const sourceSamplesDir = path.join(projectRoot, "assets", "SourceSamples");

/**
 * Node host whose *default song* is the stable test fixture, not the bundled
 * demo (BUG-50). The bundled song is product content that changes; tying the
 * unit suite to it made every asset edit a test failure. Source Samples still
 * come from the real `assets/` directory so audio paths stay realistic.
 */
const testHost: Host = {
  ...nodeHost,
  assets: {
    ...nodeHost.assets,
    loadDefaultSong: async () => {
      const project = readFileSync(testProject, "utf8");
      const samples = [0, 1, 2, 3, 4, 5].map((index) => {
        try {
          return new Uint8Array(
            readFileSync(path.join(sourceSamplesDir, `${index}.ogg`)),
          );
        } catch {
          return null;
        }
      });
      return { project, samples };
    },
  },
};

setHost(testHost);
