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
as a TypeScript + Electron desktop app. Web Audio (Chromium) replaces the Rust
web audio backend; the Spectral engine's `prism_dsp` phase vocoder is compiled
to WebAssembly and called from TypeScript. Full player, sampler/spectral
editors, tracker EDIT MODE, cover art, piano, folder swapping and exports are
ported.
**Source of Truth (Rust):** `../SourceRepo/1000-shrines-of-spirit/src/0007/`
**Rust Kanban:** `../SourceRepo/1000-shrines-of-spirit/src/0007/manage/KANBAN.md`
**Parity Checklist:** `../SourceRepo/1000-shrines-of-spirit/src/0007/PARITY.md`
**Original HTML:** `../SourceRepo/1000-shrines-of-spirit/src/0006/index.html`
**Board Last Updated:** 2026-09-12 17:50 by opencode

### Branding (user-confirmed)

- **Font:** the bundled Medodica Regular (`MedodicaRegular.otf`), exposed as the
  `"Medodica"` CSS family. (User wrote "Melodica"; the asset/upstream family is
  Medodica — flag if the file should be renamed.)
- **Light theme is the default** (the `System` option is removed). Light uses
  the brand green `#6cd73c` on `#ffffff` panels.
- Dark theme remains available via the header toggle; choice persists in
  `localStorage`.

### Technical Handoff Notes

- **Porting map (Rust -> TS):**
  | Rust | TS location |
  | --- | --- |
  | `lantern-fur` | `src/core/fur/` |
  | `lantern-core` | `src/core/{songModel,timing,pitch,sampler,spectral,project,export,midi,dsp,tracker}.ts` |
  | `lantern-audio` (web) | `src/audio/{backend,webSampler,webAudioBackend}.ts` |
  | `lantern-app` | `src/renderer/` (React) |
  | `prism_dsp` | `native/prism-wasm/` -> `src/renderer/vendor/prism/` + `src/wasm/prism.ts` |
  | folder/file I/O | `src/main/` + `src/preload/` |
- **Dropped:** native `rodio` backend, `eframe` storage, `trunk` packaging.
- **Byte-format contracts:** WAV PCM16 (LE asymmetric scaling), ZIP STORE
  (DOS date `0x0021`, CRC-32), MIDI (`TICKS_PER_ROW = 24`, big-endian, no
  running status), Project JSON v1 (camelCase, legacy `rootNote` migration,
  Rust serde `NoteValue` encoding), cover PRNG seed `9001`, offline mixdown
  PRNG seed `"LANTERN\x01"`.
- **WASM build:** `npm run build:prism-wasm` uses `wasm-bindgen-cli` (installed
  to `~/.cargo/bin`) after `cargo build --target wasm32-unknown-unknown`. Output
  is committed under `native/prism-wasm/pkg/` and copied to
  `src/renderer/vendor/prism/`; Vite emits the `.wasm` as a hashed asset.

### Commands

```
npm run dev              # Vite renderer + Electron (renderer hot reload)
npm run build            # esbuild main/preload + vite renderer -> dist/
npm run typecheck        # renderer + node tsconfigs
npm test                 # Vitest unit tests
npm run test:e2e         # Playwright Electron smoke test (needs dist/)
npm run audit:deps       # dependency-provenance / slopsquatting audit
npm run build:prism-wasm # rebuild prism_dsp WASM (needs wasm-bindgen-cli)
npm run test:all         # typecheck + unit + audit + build + e2e
```

### Verification (2026-09-12 17:50)

- `npm run typecheck` — clean.
- `npx vitest run` — **6 files, 35 tests passing**, including the real
  `prism_dsp` WASM engine (freeze + cross-synth) instantiated in-process.
- `npm run audit:deps` — 40 checks passed, 0 failures; every direct dep
  verified against npm + expected repo + lock integrity; 172 transitive
  lockfile packages registry-resolved with sha512.
- `npm run build` — renderer 326 kB JS + 326 kB WASM (102 kB gzip) + hashed font.
- `npx playwright test` — Electron launches, loads
  `flight_school_night_shift`, renders transport/mixer/tracker, toggles
  Light→Dark theme, and opens the Project JSON window.

---

## Ideas

- **0007E-IDEA-001** — Spectrogram/FFT inspector panel using prism_dsp frames.
- **0007E-IDEA-002** — Draggable ADSR graph points and freeze-point waveform
  drag (currently sliders + trim drag).
- **0007E-IDEA-003** — `electron-builder` packaging; compress/generate the
  ~38 MB CHIP mix WAV.
- **0007E-IDEA-004** — Web Worker hosting the prism_dsp WASM module if inline
  rendering ever blocks a frame on long samples.

## Bugs

_(none open — see 0007E-BUG-001 in Completed)_

## Planned Features

- **0007E-PLAN-019** — Hover explainer sidebar card (contextual title/body for
  instrument, cell, channel, cover art), the last remaining Rust-chrome piece.
- **0007E-PLAN-020** — Cross-channel range selection in the tracker (current
  selection is per-channel); Ctrl/Cmd+A "all columns" spans one channel.

## Assigned

_(none currently)_

## Completed

- **0007E-PLAN-000** — Architecture analysis. *(2026-09-12 17:10)* Mapped all
  four Rust crates + `prism_dsp`; confirmed Electron/Chromium → port the web
  backend, drop `rodio`.

- **0007E-PLAN-001** — Scaffold. *TS 7 removed `baseUrl`; paths are `./src/*`.*
  Electron + Vite + React + Vitest + Playwright + esbuild build/dev scripts.

- **0007E-PLAN-002/003/004** — Core ports: `.fur` parser (INF2/SNG2/ADIR/INS2/
  WAVE/PATN/legacy INFO), song model + timelines, timing (speed/`F0xx`/`Cxxx`/
  virtual tempo), pitch, sampler settings + look-ahead `Scheduler`, project v1
  schema, WAV/ZIP, MIDI writer, offline `renderSamplerMix`. Verified against the
  v251 and v181 fixtures (incl. golden-battletrain 94.416 s).

- **0007E-PLAN-005** — Unit tests: parser, model, scheduler, envelopes,
  ping-pong, project round-trip, WAV/ZIP, MIDI, offline mixdown, tracker edit
  helpers, WASM adapter, real prism_dsp WASM.

- **0007E-PLAN-006/007/008** — Web Audio backend + React vertical slice +
  Electron main/preload; verified by E2E.

- **0007E-PLAN-009/010** — Slopsquatting dependency audit + Playwright E2E.
  *(Audit now retries transient registry failures.)*

- **0007E-PLAN-011b — prism_dsp WASM build + Spectral wiring.** *(2026-09-12
  17:45)* Installed `wasm-bindgen-cli 0.2.128`, added the `render_fused`
  binding, built to wasm32 (326 KB), emitted it as a Vite asset, and lazily
  initialise/register it in the renderer. The Spectral editor tab exposes all
  eight modes, A/B freeze/tune/volume/formant, per-mode amount, stereo width
  and loop length, and a Render button.

- **0007E-PLAN-012 — Chrome + theming.** Cover art: animated 32×32
  Bayer-dithered Matrix background + spinning disc with note-trigger pulses and
  1600×1600 PNG export. Piano visualiser with held-note colours and noise
  readout. Light-default/dark theme toggle + `localStorage` persistence, brand
  `#6cd73c`. *(Hover explainer card remains as 0007E-PLAN-019.)*

- **0007E-PLAN-013 — Tracker EDIT MODE.** Cell selection, arrow / Ctrl+arrow /
  Shift-extend navigation, Z/X/C/Q/A/W/S entry, Ctrl+C/V + Shift+V flood paste
  (tagged clipboard JSON), right-click note/instrument/volume/FX menus,
  interpolate, Pattern Manager (move/add/duplicate/remove), Clear Patterns,
  Keyboard Help, and 20-step snapshot undo/redo.

- **0007E-PLAN-014 — Sampler + Spectral editor windows.** Draggable window with
  Sampler/Spectral tabs, trim waveform drag, Start/End, source, transpose,
  loop/ping-pong, ADSR sliders, volume/dB, random pan, polyphony/cap, preview +
  Ref Pitch. Spectral tab gated on the WASM engine.

- **0007E-PLAN-015 — Folder-load / song-swap.** Electron folder dialog →
  recursive read → `assembleSongFolder` (exactly one `.fur`, optional 0/1-based
  stems, optional source samples, optional/synthesized project, chip mix), then
  atomic backend dispose + reload.

- **0007E-PLAN-016 — Exports/IO.** Save `.FUR`, Save `.MIDI`, Project JSON
  copy/apply/download, Package Samples ZIP, Save `.WAV` in CHIP (embedded mix)
  and SAMPLER (offline mixdown) modes, over Electron save dialogs.

- **0007E-PLAN-017 — Transport/audition.** Row/cell click seek + sampler
  audition, Space (play/pause) and Ctrl+Space (resume) shortcuts,
  follow-playhead / instrument-tint / beat-line toggles, sample waveforms with
  instrument-coloured playheads.

- **0007E-PLAN-018 — Source Sample windows.** Six-slot load/play/stop/info,
  editable name/comments, Clear Samples confirmation, decoded-duration display.

- **0007E-BUG-001 — 2-byte `tagEquals` bug.** Fixed; regression-tested.

---

_Add new cards at the bottom of their bucket; move them rather than copy._
