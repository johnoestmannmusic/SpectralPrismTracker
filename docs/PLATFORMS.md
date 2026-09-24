# Platform support (HC003)

SpectralPrism Tracker ships two front ends from one code base:

| Target      | Entry                                    | Runs                              |
| ----------- | ---------------------------------------- | --------------------------------- |
| Desktop TUI | `src/tui/main.tsx` → `dist/tui/main.mjs` | Node ≥ 22 (macOS, Linux, Windows) |
| Web TUI     | `src/web/main.tsx` → `dist/web`          | Any modern browser (static host)  |

## Paths and user state

`src/runtime/config.ts` resolves the config/autosave directory in this order:

1. `SPT_CONFIG` (explicit file path; legacy `LANTERN_CONFIG` still works).
2. `$XDG_CONFIG_HOME/spectralprism` — POSIX when set.
3. `%APPDATA%\spectralprism` — Windows when `APPDATA` is set.
4. `~/.config/spectralprism` — fallback (POSIX and macOS).

On first run an existing `~/.config/lantern/config.json` is migrated into the
new directory automatically. Covered by `tests/unit/config-paths.test.ts`.

## Other OS-sensitive surfaces

- **Control socket** (`src/control/paths.ts`): Unix domain socket on
  macOS/Linux, named pipe (`\\.\pipe\spectralprism-<user>`) on Windows.
- **Audio**: desktop uses `node-web-audio-api` (prebuilt binaries installed as
  a native dependency); the web app uses the browser's Web Audio API in the
  visitor's own page. The browser resumes the audio context on the first user
  gesture.
- **Terminal**: Ink targets any ANSI terminal; Windows Terminal, macOS Terminal
  and common Linux terminals are supported. Shift+arrow selection uses
  non-scrollback navigation (see BUG-15).
- **CI**: `.github/workflows/ci.yml` runs typecheck, unit tests, lint, format
  and both builds on `ubuntu-latest`, `macos-latest` and `windows-latest`.

## Folder distribution (desktop)

`npm run build:dist` (`scripts/build-dist.mjs`) assembles
`dist/spectralprism-tracker/`: `dist/tui/*` plus the production dependency
closure of the runtime externals (`ink`, `react`, `node-web-audio-api`) and
`spt` / `spt.cmd` launchers. It is a **folder**, not a single-file binary —
Node ≥ 22 must be on PATH, and the native audio module + `assets/` + WASM stay
beside `main.mjs` because that is where the app resolves them. The whole
`node-web-audio-api` package (all platform prebuilds) is copied, so one folder
runs on macOS, Linux and Windows. `--archive` (or `npm run build:dist:archive`)
also emits a `.tar.gz`. The build verifies every external resolves from inside
the assembled folder and fails otherwise.

## Static web deployment

`npm run build:web` produces a single self-contained folder, `dist/web`: the
browser Host, the Session and the Ink TUI all run in the visitor's page. Serve
that folder with any static file server — there is **no Node host, no SSE
stream and no shared session** (HC005). `npm run serve:web` runs a local static
preview on `http://127.0.0.1:8123` for development and Playwright.
