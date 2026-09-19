import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ink";
import { setHost } from "@/host";
import { nodeHost } from "@/host/node";
import { initPrismWasm } from "@/wasm/prismNode";
import { saveBackup } from "@/tui/autosave";
import { App } from "@/tui/App";
import { Session } from "@/tui/session";
import { createTerminalStreams } from "./terminalStreams";

/**
 * Web host for the TUI (HC003).
 *
 * Ink's React reconciler is Node-only in practice: it never commits host
 * components in a browser bundle (see FEAT-105 notes). So the web deployment
 * runs the *same* Ink TUI in a local Node process and streams it to an
 * xterm.js frame over Server-Sent Events, with input POSTed back. Audio uses
 * `node-web-audio-api`, so a locally-run `lantern --serve` plays on the host.
 */

const PORT = Number(
  process.env.SPT_WEB_PORT ?? process.env.LANTERN_WEB_PORT ?? 8123,
);
const HOST =
  process.env.SPT_WEB_HOST ?? process.env.LANTERN_WEB_HOST ?? "127.0.0.1";
const MAX_LOG = 400_000;

const here = fileURLToPath(new URL(".", import.meta.url));
const distWeb = path.resolve(here, "..", "..", "dist", "web");
const uploadDir = path.join(process.env.TMPDIR ?? "/tmp", "lantern-web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".sptproj": "application/json",
  ".lampjson": "application/json",
};

const clients = new Set<ServerResponse>();
let outputLog = "";

function broadcast(chunk: string): void {
  outputLog = (outputLog + chunk).slice(-MAX_LOG);
  for (const client of clients) {
    client.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
}

const streams = createTerminalStreams({
  columns: 120,
  rows: 32,
  onOutput: broadcast,
});

function readBody(
  request: import("node:http").IncomingMessage,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => resolve(Buffer.concat(parts)));
    request.on("error", reject);
  });
}

async function main(): Promise<void> {
  setHost(nodeHost);
  const session = new Session();

  render(<App session={session} />, {
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  if (await initPrismWasm()) session.markWasmReady();
  session.setAutosaveHook(() => {
    void saveBackup(session);
  });
  await session.init();

  // Web always starts from the bundled default project: there is no
  // filesystem, and the last-opened path from a desktop config is meaningless.
  session.setWebMode(true);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    if (url.pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }

    if (url.pathname === "/api/stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      response.write(`data: ${JSON.stringify(outputLog)}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (url.pathname === "/api/input" && request.method === "POST") {
      const body = await readBody(request);
      streams.stdin.push(body.toString("utf8"));
      response.writeHead(204).end();
      return;
    }

    if (url.pathname === "/api/resize" && request.method === "POST") {
      const body = await readBody(request);
      try {
        const size = JSON.parse(body.toString("utf8")) as {
          cols?: number;
          rows?: number;
        };
        if (size.cols && size.rows) {
          streams.stdout.resize(
            Math.max(size.cols, 20),
            Math.max(size.rows, 8),
          );
        }
      } catch {
        /* ignore malformed resize payloads */
      }
      response.writeHead(204).end();
      return;
    }

    if (url.pathname === "/api/status") {
      const state = session.getState();
      response.writeHead(200, { "Content-Type": MIME[".json"]! });
      response.end(
        JSON.stringify({
          playing: state.playing,
          name: state.song?.meta.name ?? "SpectralPrism Tracker",
          time: state.time,
          duration: state.duration,
          dirty: state.dirty,
          stepthrough: state.stepthrough,
          musicLicense: state.project?.musicLicense ?? "",
          codeLicense: state.project?.codeLicense ?? "",
          projectPath: state.projectPath,
        }),
      );
      return;
    }

    if (url.pathname === "/api/download-wav") {
      // Serve the bundled demo WAV supplied in `assets/WAVExport` (web has no
      // filesystem, so this is the only WAV download).
      const wavDir = path.join(distWeb, "assets", "WAVExport");
      try {
        const files = (await readdir(wavDir)).filter((name) =>
          name.toLowerCase().endsWith(".wav"),
        );
        if (files.length === 0) {
          response.writeHead(404).end("No bundled WAV");
          return;
        }
        const bytes = await readFile(path.join(wavDir, files[0]!));
        response.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Disposition": `attachment; filename="${files[0]}"`,
        });
        response.end(bytes);
      } catch {
        response.writeHead(404).end("No bundled WAV");
      }
      return;
    }

    if (url.pathname === "/api/project") {
      const project = session.buildProjectFile();
      if (!project) {
        response.writeHead(404).end("No project loaded");
        return;
      }
      const { projectToJson } = await import("@/core/project");
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="project.sptproj"',
      });
      response.end(projectToJson(project, true));
      return;
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      const name = (url.searchParams.get("name") ?? "upload.sptproj").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const body = await readBody(request);
      await mkdir(uploadDir, { recursive: true });
      const target = path.join(uploadDir, name);
      await writeFile(target, body);
      response.writeHead(200, { "Content-Type": MIME[".json"]! });
      response.end(JSON.stringify({ path: target }));
      return;
    }

    // Static files from dist/web.
    const relative = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(distWeb, path.normalize(relative));
    if (!filePath.startsWith(distWeb)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const bytes = await readFile(filePath);
      const type = MIME[path.extname(filePath)] ?? "application/octet-stream";
      response.writeHead(200, { "Content-Type": type });
      response.end(bytes);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(
      `SpectralPrism Tracker web host running at http://${HOST}:${PORT}`,
    );
    console.log(`Serving ${distWeb}`);
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
