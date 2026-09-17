import { render } from "ink";
import { App } from "./App";
import { Session } from "./session";
import { initPrismWasmNode } from "@/wasm/prismNode";

export async function main(): Promise<void> {
  const session = new Session();
  const instance = render(<App session={session} />);

  // WASM is optional: without it spectral instruments fall back to their
  // plain sample rather than failing.
  if (initPrismWasmNode()) session.markWasmReady();

  await session.init();
  await instance.waitUntilExit();
  session.dispose();
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
