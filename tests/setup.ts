import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setHost } from "@/host";
import { nodeHost } from "@/host/node";

// Tests run in Node: install the Node host so `new Session()` works exactly as
// the desktop entrypoint does. Point the shared host at a throwaway config path
// so session writes (last project, cyclesMode, autosave) never touch the
// developer's real `~/.config/lantern`.
process.env.LANTERN_CONFIG = path.join(
  mkdtempSync(path.join(tmpdir(), "lantern-test-")),
  "config.json",
);

setHost(nodeHost);
