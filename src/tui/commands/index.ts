import { builtinCommands } from "./builtins";
import { CommandRegistry } from "./registry";

/** Builds the default registry (TUI and any future script/agent host share it). */
export function createRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.registerAll(builtinCommands);
  return registry;
}

export { builtinCommands } from "./builtins";
export { CommandRegistry } from "./registry";
export * from "./fuzzy";
export * from "./types";
