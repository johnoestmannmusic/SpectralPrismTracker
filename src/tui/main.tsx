import { render } from "ink";
import { createRegistry } from "./commands";
import { App } from "./App";
import { Session } from "./session";
import { ControlServer } from "@/control/server";
import { setHost } from "@/host";
import { nodeHost } from "@/host/node";
import { disposePrismWasm, initPrismWasm } from "@/wasm/prismNode";
import { openPath } from "./io";
import { saveBackup } from "./autosave";
import { resolveStartupProject } from "./startup";

export async function main(): Promise<void> {
  setHost(nodeHost);
  const session = new Session();
  const instance = render(<App session={session} />, { exitOnCtrlC: false });

  // WASM is optional: without it spectral instruments fall back to their
  // plain sample rather than failing. Prefer the worker thread when bundled.
  if (await initPrismWasm()) session.markWasmReady();

  // Live control channel for scripts/agents (disable with SPT_CONTROL=0).
  const control = new ControlServer({ session, registry: createRegistry() });
  if ((process.env.SPT_CONTROL ?? process.env.LANTERN_CONTROL) !== "0") {
    try {
      await control.start();
    } catch (error) {
      session.setError(`Control socket unavailable: ${String(error)}`);
    }
  }

  await session.init();

  // Autosave every 15 mutating actions into the config dir.
  session.setAutosaveHook(() => {
    void saveBackup(session);
  });

  // Reopen the configured/last project when there is one; otherwise the
  // bundled default loaded by init() stays in place.
  const config = await nodeHost.config.read();
  const startup = resolveStartupProject(config);
  if (startup) {
    const opened = await openPath(session, startup);
    if (!opened.ok) {
      session.setError(
        `Cannot open ${startup}: ${opened.error ?? "unknown error"}`,
      );
    }
  }

  // Quit: unmount Ink, close the socket/audio, stop the Prism worker thread so
  // the event loop can drain, then exit explicitly so the shell prompt always
  // returns (BUG-36).
  await instance.waitUntilExit();
  await control.stop();
  session.dispose();
  disposePrismWasm();
  process.exit(0);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
