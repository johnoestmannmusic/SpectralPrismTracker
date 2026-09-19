import { chmodSync, existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import type { CommandRegistry } from "@/tui/commands/registry";
import type { CommandContext } from "@/tui/commands/types";
import type { Session } from "@/tui/session";
import { resolveSocketPath } from "./paths";

export interface ControlRequest {
  id?: number | string;
  ping?: boolean;
  command?: string;
  query?: string;
  subscribe?: string[];
  unsubscribe?: string[];
}

export interface ControlServerOptions {
  session: Session;
  registry: CommandRegistry;
  socketPath?: string;
  /** Poll interval for event diffs. */
  pollMs?: number;
}

const EVENT_KEYS = [
  "song",
  "transport",
  "tracker",
  "mixer",
  "status",
  "samples",
] as const;

interface Client {
  socket: net.Socket;
  events: Set<string>;
  buffer: string;
}

/**
 * Live control channel: a local Unix socket (named pipe on Windows) speaking
 * newline-delimited JSON. Agents run the exact same command registry the TUI
 * uses and subscribe to state-change events.
 *
 * Requests: `{ "id":1, "command":"play" }`, `{ "query":"transport.playing" }`,
 * `{ "subscribe":["transport","meters"] }`, `{ "ping":true }`.
 * Responses: `{ "id":1, "ok":true, "message":"Playing", "data":… }`.
 * Events: `{ "type":"event", "event":"transport", "data":… }`.
 */
export class ControlServer {
  private readonly session: Session;
  private readonly registry: CommandRegistry;
  private readonly socketPath: string;
  private readonly pollMs: number;
  private server: net.Server | null = null;
  private clients = new Set<Client>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = new Map<string, string>();

  constructor(options: ControlServerOptions) {
    this.session = options.session;
    this.registry = options.registry;
    this.socketPath = options.socketPath ?? resolveSocketPath();
    this.pollMs = options.pollMs ?? 120;
  }

  get path(): string {
    return this.socketPath;
  }

  async start(): Promise<void> {
    if (this.server) return;
    if (process.platform !== "win32" && existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        /* stale socket, best effort */
      }
    }
    const server = net.createServer((socket) => this.onConnection(socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.socketPath, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") {
      try {
        chmodSync(this.socketPath, 0o600);
      } catch {
        /* best effort */
      }
    }
    this.session.setControlPath(this.socketPath);
    this.timer = setInterval(() => this.pollEvents(), this.pollMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const client of this.clients) client.socket.destroy();
    this.clients.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (process.platform !== "win32" && existsSync(this.socketPath)) {
        try {
          unlinkSync(this.socketPath);
        } catch {
          /* best effort */
        }
      }
    }
    this.session.setControlPath(null);
  }

  private onConnection(socket: net.Socket): void {
    const client: Client = { socket, events: new Set(), buffer: "" };
    this.clients.add(client);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      client.buffer += chunk;
      let index = client.buffer.indexOf("\n");
      while (index >= 0) {
        const line = client.buffer.slice(0, index).trim();
        client.buffer = client.buffer.slice(index + 1);
        if (line) void this.handle(client, line);
        index = client.buffer.indexOf("\n");
      }
    });
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
  }

  private context(): CommandContext {
    return {
      session: this.session,
      listCommands: () => this.registry.all(),
      print: (text: string) => this.session.setStatus(text),
    };
  }

  private async handle(client: Client, line: string): Promise<void> {
    let request: ControlRequest;
    try {
      request = JSON.parse(line) as ControlRequest;
    } catch {
      this.send(client, { ok: false, error: "invalid JSON" });
      return;
    }

    if (request.ping) {
      this.send(client, { id: request.id, ok: true, type: "pong" });
      return;
    }
    if (request.subscribe) {
      for (const event of request.subscribe) client.events.add(event);
      // Send the current value of each newly subscribed event immediately, so a
      // subscriber does not have to wait for the next change (and a transport
      // that never changes still yields a snapshot).
      const payloads = this.eventPayloads();
      for (const event of request.subscribe) {
        if (payloads[event] !== undefined) {
          this.send(client, { type: "event", event, data: payloads[event] });
        }
      }
      this.send(client, {
        id: request.id,
        ok: true,
        data: { subscribed: [...client.events] },
      });
      return;
    }
    if (request.unsubscribe) {
      for (const event of request.unsubscribe) client.events.delete(event);
      this.send(client, {
        id: request.id,
        ok: true,
        data: { subscribed: [...client.events] },
      });
      return;
    }
    if (request.query !== undefined) {
      const value = this.session.query(request.query);
      this.send(client, {
        id: request.id,
        ok: true,
        data: { path: request.query, value },
      });
      return;
    }
    if (typeof request.command === "string") {
      try {
        const result = await this.registry.execute(
          request.command,
          this.context(),
        );
        this.send(client, { id: request.id, ...result });
      } catch (error) {
        this.send(client, { id: request.id, ok: false, error: String(error) });
      }
      return;
    }
    this.send(client, {
      id: request.id,
      ok: false,
      error: "no command, query, ping or subscribe",
    });
  }

  private send(client: Client, message: unknown): void {
    try {
      client.socket.write(`${JSON.stringify(message)}\n`);
    } catch {
      this.clients.delete(client);
    }
  }

  /** Current payload for every event key, used by the poller and subscribe. */
  private eventPayloads(): Record<string, unknown> {
    const snapshot = this.session.snapshot();
    return {
      song: snapshot.song,
      transport: snapshot.transport,
      tracker: snapshot.tracker,
      mixer: snapshot.mixer,
      status: snapshot.status,
      samples: snapshot.samples,
      meters: snapshot.meters,
    };
  }

  private pollEvents(): void {
    const snapshot = this.session.snapshot();
    const payloads = this.eventPayloads();
    for (const key of EVENT_KEYS) {
      const serialised = JSON.stringify(payloads[key]);
      if (this.last.get(key) === serialised) continue;
      this.last.set(key, serialised);
      this.emit(key, payloads[key]);
    }
    // Meters change continuously; always emit to subscribers.
    this.emit("meters", snapshot.meters, true);
  }

  private emit(event: string, data: unknown, always = false): void {
    for (const client of this.clients) {
      if (!client.events.has(event)) continue;
      this.send(client, { type: "event", event, data });
    }
    if (always) return;
  }
}
