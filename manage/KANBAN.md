# 0007-Electron — Lantern Music Player (TypeScript / Electron) — Project Kanban

How to use:
This file is the shared Kanban Markdown coordination board for porting the
Rust egui/eframe Lantern Music Player (`../SourceRepo/1000-shrines-of-spirit/src/0007/`)
to a TypeScript Electron application in this repository.
Agents should only assign themselves to cards not already assigned, move cards
between buckets instead of duplicating them, preserve card IDs, and append dated
process comments after each completed feature or verification.
Buckets: **Ideas**, **Bugs**, **Planned Features**, **Assigned**, **Completed**.
A found bug gets a card in Bugs (symptom, root cause once known, fix approach);
once verified fixed it moves to Completed like any other card, keeping its ID.
Dates include a time (HH:MM).

---

## Project: 0007-Electron — Lantern Music Player (TypeScript / Electron)

**Project Title:** 0007-Electron — Lantern Music Player (TypeScript / Electron)
**Project Description:** Reimplement the Rust egui/eframe Lantern Music Player
as a TypeScript + Electron desktop app. The original Rust web build is the
functional and aesthetic reference. Electron's renderer is Chromium, so the
Rust `web.rs`/`web_sampler.rs` Web Audio backend maps almost 1:1 to TypeScript
and the native `rodio` backend is unnecessary. The Spectral Fusion engine is a
3.5k-line Rust `prism_dsp` phase vocoder with no JS equivalent; it is compiled
to WebAssembly and called from TypeScript so its numerical output is preserved.
**Source of Truth (Rust):** `../SourceRepo/1000-shrines-of-spirit/src/0007/`
**Rust Kanban:** `../SourceRepo/1000-shrines-of-spirit/src/0007/manage/KANBAN.md`
**Parity Checklist:** `../SourceRepo/1000-shrines-of-spirit/src/0007/PARITY.md`
**Original HTML:** `../SourceRepo/1000-shrines-of-spirit/src/0006/index.html`
**Board Last Updated:** 2026-09-12 17:20 by opencode
**Stack decision (user-confirmed):** React + Vite + TypeScript; `prism_dsp`
compiled to WASM; vertical slice first; Vitest unit tests + Playwright Electron
E2E + dependency-provenance (slopsquatting) audit.

### Technical Handoff Notes

- **Porting map (Rust -> TS):**
  | Rust crate | TS location | Notes |
  | --- | --- | --- |
  | `lantern-fur` | `src/core/fur/` | zlib unwrap, header/block framing, INF2/SNG2/ADIR/INS2/WAVE/PATN/old-INFO parsers |
  | `lantern-core` | `src/core/` | `songModel`, `timing`, `pitch`, `sampler`, `spectral`, `project`, `export`, `dsp` |
  | `lantern-audio` web half | `src/audio/` | `WebAudioBackend` + `webSampler` look-ahead engine |
  | `lantern-app` | `src/renderer/` | React panels replacing egui `app.rs`/`pattern.rs`/`editor.rs`/`cover.rs`/`theme.rs` |
  | `prism_dsp` | `native/prism-wasm/` + `src/wasm/prism.ts` | Rust -> wasm32 for the Spectral engine |
  | folder/file pickers + save | `src/main/` + `src/preload/` | Electron main `fs`/dialogs over IPC |
- **Dropped by the port:** native `rodio` audio backend, `eframe` storage
  persistence (to be replaced by an Electron `userData` JSON file), and the
  wasm/JS `trunk` packaging.
- **Byte-format contracts that must not drift:** WAV PCM16 (little-endian
  asymmetric scaling), ZIP STORE (fixed DOS date `0x0021`, CRC-32), MIDI
  (big-endian, `TICKS_PER_ROW = 24`, no running status), Project JSON schema
  (camelCase, version 1, legacy `rootNote` -> `transpose` migration, Rust serde
  enum encoding for `NoteValue`), cover-art PRNG seed `9001` and offline-render
  PRNG seed `"LANTERN\x01"`.
- **Reference fixtures (in `assets/` and `tests/fixtures/`):**
  `flight_school_night_shift.fur` (v251, 4ch, 10 instruments, 52 patterns),
  `06-golden_battletrain.fur` (v181, effects/F0 tempo lane, 94.416 s),
  `lmp-default-proj.json`, 4 chip stems, 3 source samples, the full chip mix WAV.
- **Key files:** `src/core/fur/*`, `src/core/{songModel,timing,pitch,sampler,project,spectral,dsp,export}.ts`,
  `src/audio/{backend,webSampler,webAudioBackend}.ts`,
  `src/renderer/{App.tsx,components/*}`, `src/main/*`, `src/preload/*`,
  `scripts/{build,dev,audit-dependencies,build-prism-wasm}.mjs`.

### Commands

```
npm run dev            # Vite renderer + Electron (hot reload for renderer)
npm run build          # esbuild main/preload + vite renderer build -> dist/
npm run typecheck      # renderer + node tsconfigs
npm test               # Vitest unit tests
npm run test:e2e       # Playwright Electron smoke test (needs dist/ built)
npm run audit:deps     # dependency-provenance / slopsquatting audit
npm run test:all       # typecheck + unit + audit + build + e2e
```

### Milestone status (2026-09-12 17:20)

**Milestone 1 (vertical slice) is complete and verified.** The app builds,
launches under Electron, parses the bundled `.fur`, loads the project/mixer,
decodes the source samples, renders the transport, mixer, instrument list and a
read-only tracker, and supports CHIP + SAMPLER playback through the ported Web
Audio backend. Spectral, EDIT MODE, editors, cover art and folder-swap remain
as later cards.

**Verification evidence (all run from this repository):**
- `npm run typecheck` — clean (both tsconfigs).
- `npx vitest run` — 4 files, 24 tests passing.
- `npm run audit:deps` — 40 checks passed, 0 warnings, 0 failures; 172 locked
  packages inspected, all registry-resolved with sha512 integrity.
- `npm run build` — succeeds; renderer bundle 262 kB (81 kB gzip) + hashed font.
- `npx playwright test` — 1 passed: Electron launches, loads
  `flight_school_night_shift`, renders transport/mixer/tracker.

---

## Ideas

- **0007E-IDEA-001** — Spectrogram/FFT inspector panel beyond the original's
  scope, using the prism_dsp WASM frames.
- **0007E-IDEA-002** — Persist window layout and editor positions via Electron
  `userData`, mirroring the Rust `SavedEditor` eframe storage.
- **0007E-IDEA-003** — Bundle with `electron-builder`; ship the ~38 MB CHIP mix
  WAV compressed or generated to shrink the installer.

## Bugs

- **0007E-BUG-001** — `.fur` parser failed on every real file: 2-byte INS2
  feature codes (`NA`/`GB`/`EN`) never matched because `tagEquals` was
  hardcoded to `tag.length === 4`.
  *Root cause:* the shared tag comparator assumed 4-byte block tags, but INS2
  features use the same helper with 2-byte codes.
  *Fix:* compare `tag.length === text.length` element-by-element.
  *Status:* fixed and covered by `tests/unit/fur.test.ts` (parses both v251 and
  v181 fixtures). Moved to Completed.

## Planned Features

- **0007E-PLAN-011b** — Build the `prism_dsp` WASM module (`npm run
  build:prism-wasm`) and wire `src/wasm/prism.ts` into app startup, then
  implement/verify the Spectral editor tab. Scaffold exists; build environment
  currently lacks `wasm-pack`/`wasm-bindgen-cli`.
- **0007E-PLAN-012** — Visual-chrome parity: 32×32 Bayer-dithered animated
  cover art + Matrix background + 1600×1600 PNG export; piano visualiser;
  hover explainer card; full theming (System/Light/Dark) and persistence.
- **0007E-PLAN-013** — Tracker EDIT MODE: cell selection/keyboard entry,
  copy/paste/flood-paste, interpolate, Pattern Manager, Clear Patterns,
  20-step undo/redo, pattern-snapshot persistence.
- **0007E-PLAN-014** — Sampler + Spectral movable editor windows: trim drag
  handles, ADSR graph, loop/ping-pong, transpose, pan, polyphony, preview and
  reference pitch.
- **0007E-PLAN-015** — Folder-load / song-swap flow: recursive folder read,
  `assemble_song_folder` rules (one `.fur`, stems optional 0- or 1-based,
  source samples optional, synthesized default project), atomic backend reset.
- **0007E-PLAN-016** — Exports not yet ported: Standard MIDI File writer,
  offline `render_sampler_mix` WAV mixdown, "Package Samples" ZIP, Save .FUR,
  Project JSON copy/apply/download wiring.
- **0007E-PLAN-017** — Transport/audition extras: row/cell click seek +
  pattern audition, Space / Ctrl+Space shortcuts, follow-playhead and
  instrument tint toggles, sample playheads and waveforms in the UI.
- **0007E-PLAN-018** — Source Sample windows: per-slot load/info/comments,
  Clear Samples confirm, six-slot management and playhead overlays.

## Assigned

_(none currently)_

## Completed

- **0007E-PLAN-000** — Requirements gathering and architecture analysis.
  *Process (2026-09-12 17:10):* Read all four Rust crates (13,163 lines) and
  the external `prism_dsp` crate (3,487 lines); dispatched structural maps of
  the large UI/audio/parser files. Confirmed Electron renderer = Chromium, so
  the Rust web backend is the port target and `rodio` is dropped. Stack
  decisions confirmed with the user.

- **0007E-PLAN-001** — Scaffold. *Process:* Created `package.json`,
  `tsconfig.json`/`tsconfig.node.json` (TS 7 removed `baseUrl`; paths are
  `./src/*`), `vite.config.mts`, `vitest.config.mts`, `playwright.config.ts`,
  React entry, Node/esbuild build + dev scripts, and the Electron main/preload
  bootstrap. Dependencies pinned after checking each name/repo on npm.

- **0007E-PLAN-002** — `.fur` parser ported to `src/core/fur/`.
  *Process:* `reader.ts`, `blocks.ts` (INF2/SNG2/ADIR/INS2/WAVE/PATN/old-INFO),
  `parse.ts`, `node.ts`. Verified against the v251 bundled fixture (4 channels,
  10 instruments, 3 wavetables, 52 patterns, order list and first-row
  note/ins/vol) and the v181 golden-battletrain fixture (effects incl. `F0`).

- **0007E-PLAN-003** — Song model/timelines/timing/pitch in
  `src/core/{songModel,timing,pitch}.ts`. *Process:* Ported
  `build_song_model`, held instrument/note timelines, golden-angle instrument
  colours, `build_row_timing` (speed/`F0xx`/`Cxxx`/virtual-tempo effects),
  `song_position_at`, and note/frequency/playback-rate maths. Golden-battletrain
  duration reproduces at 94.416 s.

- **0007E-PLAN-004** — Sampler settings/scheduler, project schema, DSP and
  WAV/ZIP export in `src/core/{sampler,spectral,project,dsp,export}.ts`.
  *Process:* Ported `SamplerSettings`/`envelope_at`/`sample_position`/`region`,
  `Sequence::from_song` (incl. `01xx`/`02xx` pitch ramps), the look-ahead
  `Scheduler`, `loop_channel` (5 ms fades + ping-pong), `waveform`, the
  version-1 Project JSON schema with `rootNote`->`transpose` migration, Rust
  serde `NoteValue` encoding, WAV PCM16 and ZIP STORE writers. MIDI and offline
  sampler mixdown deferred to `0007E-PLAN-016`.

- **0007E-PLAN-005** — Vitest unit tests. *Process:* `tests/unit/fur.test.ts`,
  `core.test.ts`, `export.test.ts`, `prism.test.ts` — 24 tests covering parser
  counts/spot-checks, model/timeline edits, snapshot round-trips, golden
  timing, scheduler pre-roll/looping/seek, envelopes, ping-pong, project
  round-trip and legacy migration, WAV/ZIP byte layouts and the WASM adapter.

- **0007E-PLAN-006** — Web Audio backend ported to
  `src/audio/{backend,webSampler,webAudioBackend}.ts`. *Process:* Ported the
  master/channel gain+analyser graph, native-looping stem playback with
  AudioContext-clock anchoring, the 25 ms sampler look-ahead engine
  (ADSR gain automation, pitch ramps, voice stealing, random pan, baked
  loop/ping-pong buffers), previews/reference tone/auditions, meters and
  playheads. `spectralRender` is guarded until the WASM build lands.

- **0007E-PLAN-007** — React vertical slice. *Process:* `App.tsx` loads the
  bundled song via IPC, builds the model/project, pushes mixer + instrument
  settings into the backend and selects the initial mode. Components:
  `Transport`, `Mixer` (peak-hold meters), `InstrumentList`, read-only
  `PatternGrid` following the playhead. Dark Lantern palette + Medodica font.

- **0007E-PLAN-008** — Electron main/preload. *Process:* `BrowserWindow`
  bootstrap, `assets:load-default-song` (main-process zlib + parse), folder
  picker and save-dialog IPC, `contextBridge` preload API, typed
  `window.lantern`. Folder *assembly* rules remain for `0007E-PLAN-015`.

- **0007E-PLAN-009** — Dependency-provenance / slopsquatting audit.
  *Process:* `scripts/audit-dependencies.mjs` enforces a reviewed direct-dep
  allowlist, verifies registry existence, expected upstream repository,
  published version + lock-integrity match, package age and weekly downloads,
  and audits every transitive lockfile entry for registry resolution and
  sha512 integrity. Current result: 40 checks passed, 0 failures, 172 packages.

- **0007E-PLAN-010** — Playwright Electron E2E. *Process:*
  `tests/e2e/smoke.spec.ts` launches the built app, waits for the header and
  status line, and asserts transport/mixer/tracker render. Passing.

- **0007E-BUG-001** — 2-byte `tagEquals` bug (see Bugs above). Fixed and
  verified.

---

_Add new cards at the bottom of their bucket; move them rather than copy._
