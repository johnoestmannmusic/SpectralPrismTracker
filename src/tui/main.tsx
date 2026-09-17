import { render } from "ink";
import { createRegistry } from "./commands";
import { App } from "./App";
import { Session } from "./session";
import { ControlServer } from "@/control/server";
import { initPrismWasm } from "@/wasm/prismNode";

export async function main(): Promise<void> {
  const session = new Session();
  const instance = render(<App session={session} />);

  // WASM is optional: without it spectral instruments fall back to their
  // plain sample rather than failing. Prefer the worker thread when bundled.
  if (await initPrismWasm()) session.markWasmReady();

  // Live control channel for scripts/agents (disable with LANTERN_CONTROL=0).
  const control = new ControlServer({ session, registry: createRegistry() });
  if (process.env.LANTERN_CONTROL !== "0") {
    try {
      await control.start();
    } catch (error) {
      session.setError(`Control socket unavailable: ${String(error)}`);
    }
  }

  await session.init();
  await instance.waitUntilExit();
  await control.stop();
  session.dispose();
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
