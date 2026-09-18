# Platform support (HC003)

Lantern ships two front ends from one code base:

| Target      | Entry                                     | Runs                              |
| ----------- | ----------------------------------------- | --------------------------------- |
| Desktop TUI | `src/tui/main.tsx` → `dist/tui/main.mjs`  | Node ≥ 22 (macOS, Linux, Windows) |
| Web TUI     | `src/web/main.tsx` + `src/web/server.tsx` | Node host + any modern browser    |

## Paths and user state

`src/runtime/config.ts` resolves the config/autosave directory in this order:

1. `LANTERN_CONFIG` (explicit file path) — all platforms.
2. `$XDG_CONFIG_HOME/lantern` — POSIX when set.
3. `%APPDATA%\lantern` — Windows when `APPDATA` is set.
4. `~/.config/lantern` — fallback (POSIX and macOS).

Covered by `tests/unit/config-paths.test.ts`.

## Other OS-sensitive surfaces

- **Control socket** (`src/control/paths.ts`): Unix domain socket on
  macOS/Linux, named pipe (`\\.\pipe\lantern-<user>`) on Windows.
- **Audio** (`node-web-audio-api`): ships prebuilt binaries; the desktop build
  installs it as a native dependency. The web host runs audio on the host
  machine.
- **Terminal**: Ink targets any ANSI terminal; Windows Terminal, macOS Terminal
  and common Linux terminals are supported. Shift+arrow selection uses
  non-scrollback navigation (see BUG-15).
- **CI**: `.github/workflows/ci.yml` runs typecheck, unit tests, lint, format
  and both builds on `ubuntu-latest`, `macos-latest` and `windows-latest`.

## Web host

`npm run build:web` produces `dist/web` (static xterm client) and
`dist/web-host` (Node SSE host). `npm run serve:web` starts the host on
`127.0.0.1:8123`; override with `LANTERN_WEB_HOST` / `LANTERN_WEB_PORT`.
