import { readFileSync } from "node:fs";
import { ControlClient } from "./client";
import { resolveSocketPath } from "./paths";
import { runScript } from "./script";

interface Options {
  file?: string;
  command?: string;
  socket?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--socket") options.socket = argv[++i];
    else if (arg === "--json") options.json = true;
    else if (arg === "-c" || arg === "--command") options.command = argv[++i];
    else if (!arg.startsWith("-")) options.file = arg;
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const socketPath = options.socket ?? resolveSocketPath();

  let source: string;
  if (options.command) {
    source = options.command;
  } else if (options.file) {
    source = readFileSync(options.file, "utf8");
  } else {
    process.stderr.write(
      "usage: lantern-run <script.lmpscript> [--socket path] [--json]\n" +
        '       lantern-run -c "/play" [--socket path] [--json]\n',
    );
    process.exitCode = 2;
    return;
  }

  let client: ControlClient;
  try {
    client = await ControlClient.connect(socketPath);
  } catch (error) {
    process.stderr.write(
      `Cannot connect to the SpectralPrism control socket at ${socketPath}.\n` +
        `Is the app running? Set SPT_SOCKET to override. (${String(error)})\n`,
    );
    process.exitCode = 3;
    return;
  }

  try {
    const result = await runScript(client, source, {
      onStep: (step) => {
        if (options.json) {
          process.stdout.write(
            `${JSON.stringify({ type: "step", ...step })}\n`,
          );
        } else {
          const mark = step.kind === "log" ? "·" : step.ok ? "✔" : "✖";
          const detail = step.error ? `  ${step.error}` : "";
          process.stdout.write(`${mark} ${step.line}: ${step.text}${detail}\n`);
        }
      },
    });
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ type: "done", ok: result.ok, passed: result.passed, failed: result.failed })}\n`,
      );
    } else {
      process.stdout.write(
        `\n${result.ok ? "PASSED" : "FAILED"} — ${result.passed} ok, ${result.failed} failed\n`,
      );
    }
    process.exitCode = result.ok ? 0 : 1;
  } finally {
    client.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
