import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ControlClient } from "@/control/client";
import { ControlServer } from "@/control/server";
import { runScript } from "@/control/script";
import { createRegistry } from "@/tui/commands";
import { Session } from "@/tui/session";

describe("control socket", () => {
  const session = new Session();
  const registry = createRegistry();
  let dir = "";
  let server: ControlServer;
  let client: ControlClient;
  const events: Array<{ event: string; data: unknown }> = [];

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lantern-ctl-"));
    await session.init();
    server = new ControlServer({
      session,
      registry,
      socketPath: path.join(dir, "control.sock"),
      pollMs: 30,
    });
    await server.start();
    client = await ControlClient.connect(server.path);
    client.onEvent((event) =>
      events.push({ event: event.event, data: event.data }),
    );
  }, 60_000);

  afterAll(async () => {
    client?.close();
    await server?.stop();
    session.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it("answers ping", async () => {
    const response = await client.ping();
    expect(response).toMatchObject({ ok: true, type: "pong" });
  });

  it("runs registry commands", async () => {
    const response = await client.command("/info");
    expect(response.ok).toBe(true);
    expect(response.data).toMatchObject({
      name: session.getState().song?.meta.name,
    });
  });

  it("answers queries with structured values", async () => {
    const response = await client.query("transport.mode");
    expect(response.data).toMatchObject({
      path: "transport.mode",
      value: "sampler",
    });
  });

  it("streams subscribed events", async () => {
    await client.subscribe(["transport", "meters"]);
    await client.command("/play");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.command("/stop");
    expect(events.some((entry) => entry.event === "transport")).toBe(true);
  });

  it("rejects malformed requests", async () => {
    const response = await client.request({ nonsense: true });
    expect(response.ok).toBe(false);
    expect(response.error).toBeTruthy();
  });

  it("reports the socket path on the session", () => {
    expect(session.getState().controlPath).toBe(server.path);
  });
});

describe("lmpscript runner", () => {
  function fakeClient(): ControlClient {
    return {
      command: async (command: string) => {
        if (command.includes("query song.name"))
          return { ok: true, data: { value: "aleph" } };
        if (command.includes("query n"))
          return { ok: true, data: { value: 42 } };
        return { ok: true, message: `ran ${command}`, data: { ran: command } };
      },
      query: async (query: string) => ({
        ok: true,
        data: {
          path: query,
          value: query === "transport.playing" ? true : false,
        },
      }),
      subscribe: async () => ({ ok: true, data: {} }),
    } as unknown as ControlClient;
  }

  it("runs commands, captures variables and passes assertions", async () => {
    const result = await runScript(
      fakeClient(),
      [
        "# a comment",
        "/query song.name -> $name",
        "@let greeting = hello",
        "/query n -> $count",
        "@assert transport.playing == true",
        "@assert $name == aleph",
        "@assert $count > 40",
        "@echo ${greeting} ${name}",
        "@wait 5",
      ].join("\n"),
      { sleep: async () => {} },
    );
    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(5);
  });

  it("fails on a bad assertion and continues", async () => {
    const result = await runScript(
      fakeClient(),
      [
        "@assert transport.playing == false",
        "/query n -> $c",
        "@assert $c == 42",
      ].join("\n"),
      { sleep: async () => {} },
    );
    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
  });

  it("captures stdout-style log steps", async () => {
    const logs: string[] = [];
    await runScript(fakeClient(), "@echo one\n@echo two", {
      onStep: (step) => {
        if (step.kind === "log") logs.push(step.text);
      },
    });
    expect(logs).toEqual(["one", "two"]);
  });
});
