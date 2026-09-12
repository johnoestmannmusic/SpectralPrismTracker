import init, { render_fused } from "./prism_wasm.js";
import { registerPrismWasm, type PrismWasmModule } from "@/wasm/prism";

let initialized = false;

/** Lazily initialises the prism_dsp WASM module and registers the renderer. */
export async function initPrismWasm(): Promise<boolean> {
  if (initialized) return true;
  try {
    await init();
    registerPrismWasm({ render_fused } as unknown as PrismWasmModule);
    initialized = true;
    return true;
  } catch (error) {
    console.warn("prism_dsp WASM failed to initialise:", error);
    return false;
  }
}
