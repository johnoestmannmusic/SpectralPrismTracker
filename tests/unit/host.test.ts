import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activeHost, getHost, setHost } from "@/host";
import { createNodeHost, nodeHost } from "@/host/node";
import { createNodeConfig } from "@/host/node/config";
import { Session } from "@/tui/session";

describe("host abstraction (FEAT-101)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
    setHost(nodeHost);
  });

  it("installs a default host and exposes it via getHost()", () => {
    expect(activeHost()?.kind).toBe("node");
    expect(getHost().kind).toBe("node");
  });

  it("lets a session be constructed with an explicit host", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lantern-host-"));
    tempDirs.push(dir);
    const host = createNodeHost(
      createNodeConfig({ LANTERN_CONFIG: path.join(dir, "config.json") }),
    );

    const session = new Session(host);
    expect(session.host).toBe(host);
    expect(session.host.config.backupPath()).toBe(
      path.join(dir, "backup.lmpjson"),
    );
    // The session uses the injected host rather than the process-wide default.
    expect(session.host.config.backupPath()).not.toBe(
      nodeHost.config.backupPath(),
    );
    session.dispose();
  });

  it("isolates file writes through the injected host", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lantern-host-fs-"));
    tempDirs.push(dir);
    const host = createNodeHost(
      createNodeConfig({ LANTERN_CONFIG: path.join(dir, "config.json") }),
    );
    const session = new Session(host);

    const written = await session.host.fs.writeBytesSafe(
      path.join(dir, "out.bin"),
      new Uint8Array([1, 2, 3]),
    );
    expect(written.ok).toBe(true);
    const read = await session.host.fs.readBytesSafe(path.join(dir, "out.bin"));
    expect(read.ok && Array.from(read.value)).toEqual([1, 2, 3]);
    session.dispose();
  });
});
