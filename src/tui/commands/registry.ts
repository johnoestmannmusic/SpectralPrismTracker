import { rank } from "./fuzzy";
import type {
  CommandContext,
  CommandDef,
  CommandResult,
  ParsedArgs,
} from "./types";

/** Splits a command line into tokens, honouring single/double quotes. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let has = false;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      has = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (has || current) tokens.push(current);
      current = "";
      has = false;
      continue;
    }
    current += char;
  }
  if (has || current) tokens.push(current);
  return tokens;
}

function isFlag(token: string): boolean {
  return token.startsWith("--") && token.length > 2;
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>();

  register(def: CommandDef): void {
    this.commands.set(def.name, def);
    for (const alias of def.aliases ?? []) this.commands.set(alias, def);
  }

  registerAll(defs: CommandDef[]): void {
    for (const def of defs) this.register(def);
  }

  all(): CommandDef[] {
    return Array.from(new Set(this.commands.values()));
  }

  get(name: string): CommandDef | undefined {
    return this.commands.get(name);
  }

  /** Fuzzy-ranked command suggestions for the palette. */
  suggest(query: string, limit = 12): CommandDef[] {
    const unique = this.all();
    if (!query) {
      return unique
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit);
    }
    return rank(query, unique, (command) => command.name)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  /** Maps raw positional tokens onto the command's declared args. */
  parse(def: CommandDef, tokens: string[]): ParsedArgs {
    const values: Record<string, string> = {};
    const flags: Record<string, string | boolean> = {};
    const positional: string[] = [];
    const args = def.args ?? [];
    const pending = [...tokens];

    for (let i = 0; i < pending.length; i++) {
      const token = pending[i]!;
      if (isFlag(token)) {
        const body = token.slice(2);
        const eq = body.indexOf("=");
        if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
        else if (i + 1 < pending.length && !isFlag(pending[i + 1]!))
          flags[body] = pending[++i]!;
        else flags[body] = true;
        continue;
      }
      positional.push(token);
    }

    positional.forEach((value, index) => {
      const arg = args[index];
      if (arg) values[arg.name] = value;
      else values[`_${index}`] = value;
    });

    for (const arg of args) {
      if (arg.type === "boolean" && values[arg.name] === undefined) {
        if (flags[arg.name] !== undefined)
          values[arg.name] = String(flags[arg.name]);
        else values[arg.name] = "false";
      }
    }

    return { values, flags, positional };
  }

  /** Tab-completion candidates for the arg at `argIndex`. */
  async completeArg(
    def: CommandDef,
    argIndex: number,
    prefix: string,
    ctx: CommandContext,
  ): Promise<string[]> {
    const arg = def.args?.[argIndex];
    if (!arg) return [];
    if (arg.choices)
      return arg.choices.filter((choice) => choice.startsWith(prefix));
    if (arg.complete) return arg.complete(prefix, ctx);
    return [];
  }

  /**
   * Whether pressing Enter should autocomplete the unfinished command (like
   * Tab) or execute it: complete while the command name is not yet a real
   * command and there is a suggestion to accept.
   *
   * Aliases complicate this: typing `/pat` resolves to the `setpattern` alias,
   * but the user is almost certainly still spelling `/patterns`. When the
   * typed token is a strict prefix of the best suggestion and does not already
   * begin the resolved command's own name, prefer completing.
   */
  enterAction(input: string, hasSuggestions: boolean): "complete" | "run" {
    const raw = input.trim().replace(/^\//, "");
    const tokens = tokenize(raw);
    const first = tokens[0] ?? "";
    const def = this.get(first);
    if (tokens.length <= 1 && hasSuggestions) {
      const top = this.suggest(first, 1)[0];
      if (
        top &&
        top.name.length > first.length &&
        top.name.startsWith(first) &&
        (!def || !def.name.startsWith(first))
      ) {
        return "complete";
      }
    }
    if (def) return "run";
    return hasSuggestions ? "complete" : "run";
  }

  async execute(input: string, ctx: CommandContext): Promise<CommandResult> {
    const trimmed = input.trim().replace(/^\//, "");
    if (!trimmed) return { ok: false, error: "Type a command (try /help)" };
    const tokens = tokenize(trimmed);
    const name = tokens[0]!;
    const def = this.get(name);
    if (!def) {
      const suggestions = this.suggest(name, 3).map(
        (command) => `/${command.name}`,
      );
      return {
        ok: false,
        error: suggestions.length
          ? `Unknown command /${name} — did you mean ${suggestions.join(", ")}?`
          : `Unknown command /${name}`,
      };
    }
    const args = this.parse(def, tokens.slice(1));
    for (const arg of def.args ?? []) {
      if (arg.required && args.values[arg.name] === undefined) {
        return { ok: false, error: `/${def.name} requires <${arg.name}>` };
      }
    }
    try {
      return await def.run(args, ctx);
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
}
