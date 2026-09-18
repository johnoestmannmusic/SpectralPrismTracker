import type { Session } from "../session";

export type ArgType = "string" | "path" | "number" | "boolean" | "enum";

export interface CommandArg {
  name: string;
  type: ArgType;
  required?: boolean;
  description?: string;
  /** Allowed values for `enum` args. */
  choices?: string[];
  /** Tab-completion candidates for this arg (may be async). */
  complete?: (
    prefix: string,
    ctx: CommandContext,
  ) => string[] | Promise<string[]>;
}

export interface ParsedArgs {
  /** Positional values keyed by arg name. */
  values: Record<string, string>;
  /** `--flag value` / `--flag` entries. */
  flags: Record<string, string | boolean>;
  /** Raw positional tokens, in order. */
  positional: string[];
}

/**
 * Every command returns this. Typed and JSON-serialisable so a future
 * `.lmpscript` runner or agent control channel can consume results without the
 * TUI. `message` is the human string; `data` is the machine payload.
 */
export interface CommandResult<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * The only surface commands may touch. Constructible without Ink, so the same
 * commands run under the TUI, tests, and (later) a script/socket host.
 */
export interface CommandContext {
  session: Session;
  /** Optional structured sink for non-UI hosts; the TUI writes to its status line. */
  print?: (text: string) => void;
  /** Requests app shutdown (the TUI wires this to Ink's exit). */
  exit?: () => void;
  /** Enumerates every registered command, for /help and agent discovery. */
  listCommands?: () => CommandDef[];
  /** Opens a TUI overlay (mixer / samples / editors). No-op in non-UI hosts. */
  openOverlay?: (name: OverlayName, arg?: number) => void;
}

export type OverlayName =
  | "song"
  | "mixer"
  | "samples"
  | "instruments"
  | "patterns"
  | "stepthrough"
  | "sampler"
  | "spectral"
  | "percussion"
  | "fx";

export interface CommandDef {
  /** Stable id for scripting/tests. */
  id: string;
  /** Canonical name typed after the slash. */
  name: string;
  aliases?: string[];
  description: string;
  category: string;
  args?: CommandArg[];
  /** Example invocations shown in the palette's detail line. */
  examples?: string[];
  run: (
    args: ParsedArgs,
    ctx: CommandContext,
  ) => CommandResult | Promise<CommandResult>;
}

export function ok<T>(message?: string, data?: T): CommandResult<T> {
  return { ok: true, message, data };
}

export function fail(error: string): CommandResult {
  return { ok: false, error };
}
