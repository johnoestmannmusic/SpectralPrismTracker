import type { ControlClient } from "./client";

export type StepKind = "command" | "directive" | "comment" | "log";

export interface ScriptStep {
  line: number;
  kind: StepKind;
  text: string;
  ok: boolean;
  /** Command result data / assertion detail. */
  detail?: unknown;
  error?: string;
}

export interface ScriptResult {
  ok: boolean;
  passed: number;
  failed: number;
  steps: ScriptStep[];
}

export interface RunScriptOptions {
  /** Streams each step as it completes (for live feedback). */
  onStep?: (step: ScriptStep) => void;
  /** Reference clock injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function interpolate(text: string, vars: Map<string, string>): string {
  return text
    .replace(/\$\{(\w+)\}/g, (_, name: string) => vars.get(name) ?? "")
    .replace(/\$(\w+)/g, (_, name: string) => vars.get(name) ?? "");
}

function parseDuration(token: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(token.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  return match[2] === "s" ? value * 1000 : value;
}

function stripInlineComment(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) return "";
  return trimmed;
}

async function resolveOperand(
  client: ControlClient,
  token: string,
  vars: Map<string, string>,
): Promise<unknown> {
  const text = interpolate(token.trim(), vars);
  if (text.length === 0) return "";
  if (text.startsWith("$")) return vars.get(text.slice(1)) ?? "";
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  // Bare token: treat as a query path when it looks like one, else a string.
  if (/^[a-zA-Z_][\w]*(\.[\w]+)+$/.test(text)) {
    const response = await client.query(text);
    const data = response.data as { value?: unknown } | undefined;
    return data?.value;
  }
  return text;
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "==":
      return typeof left === "number" && typeof right === "number"
        ? left === right
        : String(left) === String(right);
    case "!=":
      return String(left) !== String(right);
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case "contains":
      return Array.isArray(left)
        ? left.includes(right)
        : typeof left === "string"
          ? left.includes(String(right))
          : false;
    case "matches":
      try {
        return new RegExp(String(right)).test(String(left));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Runs a `.lmpscript` against a live control client. Scripts are a sequence of
 * slash commands (the app's own registry) plus `@` control directives:
 *
 *   # comment
 *   @let title = aleph            @let / $var interpolation
 *   /query song.name -> $name     capture a command result
 *   @assert transport.playing == true
 *   @wait 500ms                   @subscribe transport, meters
 *   @echo loaded ${title}         @exit
 */
export async function runScript(
  client: ControlClient,
  source: string,
  options: RunScriptOptions = {},
): Promise<ScriptResult> {
  const sleep = options.sleep ?? defaultSleep;
  const vars = new Map<string, string>();
  const steps: ScriptStep[] = [];
  let passed = 0;
  let failed = 0;
  let exit = false;

  const record = (step: ScriptStep): void => {
    steps.push(step);
    if (step.ok) passed += 1;
    else failed += 1;
    options.onStep?.(step);
  };

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length && !exit; i++) {
    const raw = stripInlineComment(lines[i]!);
    if (!raw) continue;
    const line = i + 1;

    if (raw.startsWith("@")) {
      const [directive, ...rest] = raw.slice(1).split(/\s+/);
      const argumentText = raw.slice(directive.length + 2).trim();
      switch (directive) {
        case "let": {
          const match = /^(\w+)\s*=\s*(.*)$/.exec(argumentText);
          if (!match) {
            record({
              line,
              kind: "directive",
              text: raw,
              ok: false,
              error: "@let needs name = value",
            });
            break;
          }
          vars.set(match[1]!, interpolate(match[2]!, vars));
          record({
            line,
            kind: "directive",
            text: raw,
            ok: true,
            detail: { [match[1]!]: vars.get(match[1]!) },
          });
          break;
        }
        case "echo": {
          const text = interpolate(argumentText, vars);
          record({ line, kind: "log", text, ok: true });
          break;
        }
        case "query": {
          const capture = /^(.*?)\s*->\s*\$(\w+)\s*$/.exec(argumentText);
          const path = interpolate(
            (capture ? capture[1]! : argumentText).trim(),
            vars,
          );
          const response = await client.query(path);
          const data = response.data as { value?: unknown } | undefined;
          if (capture) vars.set(capture[2]!, String(data?.value ?? ""));
          record({
            line,
            kind: "directive",
            text: `@query ${path}`,
            ok: !!response.ok,
            detail: data?.value ?? response.data,
            error: response.error,
          });
          break;
        }
        case "wait":
        case "sleep": {
          const ms = parseDuration(interpolate(rest[0] ?? "", vars));
          await sleep(ms);
          record({
            line,
            kind: "directive",
            text: raw,
            ok: true,
            detail: { ms },
          });
          break;
        }
        case "subscribe": {
          const events = argumentText.split(/[,\s]+/).filter(Boolean);
          const response = await client.subscribe(events);
          record({
            line,
            kind: "directive",
            text: raw,
            ok: !!response.ok,
            detail: response.data,
            error: response.error,
          });
          break;
        }
        case "assert": {
          const match =
            /^(.+?)\s+(==|!=|>=|<=|>|<|contains|matches)\s+(.+)$/.exec(
              argumentText,
            );
          if (!match) {
            record({
              line,
              kind: "directive",
              text: raw,
              ok: false,
              error: "malformed @assert",
            });
            break;
          }
          const left = await resolveOperand(client, match[1]!, vars);
          const right = await resolveOperand(client, match[3]!, vars);
          const ok = compare(match[2]!, left, right);
          record({
            line,
            kind: "directive",
            text: raw,
            ok,
            detail: { left, right, op: match[2] },
          });
          break;
        }
        case "exit": {
          exit = true;
          record({ line, kind: "directive", text: raw, ok: true });
          break;
        }
        default: {
          record({
            line,
            kind: "directive",
            text: raw,
            ok: false,
            error: `unknown directive @${directive}`,
          });
        }
      }
      continue;
    }

    // Command line, with optional `-> $var` capture.
    const capture = /^(.*?)\s*->\s*\$(\w+)\s*$/.exec(raw);
    const commandText = interpolate((capture ? capture[1]! : raw).trim(), vars);
    const response = await client.command(commandText);
    if (capture) {
      const data = response.data as { value?: unknown } | undefined;
      const captured =
        data?.value !== undefined
          ? data.value
          : (response.data ?? response.message ?? "");
      vars.set(capture[2]!, String(captured));
    }
    record({
      line,
      kind: "command",
      text: commandText,
      ok: !!response.ok,
      detail: response.data ?? response.message,
      error: response.error,
    });
  }

  return { ok: failed === 0, passed, failed, steps };
}
