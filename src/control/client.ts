import net from "node:net";

export interface ControlResponse {
  id?: number | string;
  ok?: boolean;
  type?: string;
  message?: string;
  data?: unknown;
  error?: string;
}

export interface ControlEvent {
  type: "event";
  event: string;
  data: unknown;
}

type EventHandler = (event: ControlEvent) => void;

/** NDJSON client for the live control socket. */
export class ControlClient {
  private socket: net.Socket;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: ControlResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  private handlers = new Set<EventHandler>();

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error) => {
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
  }

  static connect(socketPath: string, timeoutMs = 5000): Promise<ControlClient> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`control socket timed out: ${socketPath}`));
      }, timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(new ControlClient(socket));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.onLine(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let message: ControlResponse | ControlEvent;
    try {
      message = JSON.parse(line) as ControlResponse | ControlEvent;
    } catch {
      return;
    }
    if ((message as ControlEvent).type === "event") {
      for (const handler of this.handlers) handler(message as ControlEvent);
      return;
    }
    const id = (message as ControlResponse).id;
    if (typeof id === "number" && this.pending.has(id)) {
      const entry = this.pending.get(id)!;
      this.pending.delete(id);
      entry.resolve(message as ControlResponse);
    }
  }

  request(
    payload: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<ControlResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`control request timed out: ${JSON.stringify(payload)}`),
        );
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  }

  command(command: string, timeoutMs?: number): Promise<ControlResponse> {
    return this.request({ command }, timeoutMs);
  }

  query(path: string): Promise<ControlResponse> {
    return this.request({ query: path });
  }

  subscribe(events: string[]): Promise<ControlResponse> {
    return this.request({ subscribe: events });
  }

  ping(): Promise<ControlResponse> {
    return this.request({ ping: true });
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.socket.end();
    this.socket.destroy();
  }
}
