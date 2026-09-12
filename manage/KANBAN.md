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
to WebAssembly and called from TypeScript.
**Source of Truth (Rust):** `../SourceRepo/1000-shrines-of-spirit/src/0007/` at
commit `5948fdc` ("Handover").
**Rust Kanban:** `../SourceRepo/1000-shrines-of-spirit/src/0007/manage/KANBAN.md`
**Parity Checklist:** `../SourceRepo/1000-shrines-of-spirit/src/0007/PARITY.md`
**Original HTML:** `../SourceRepo/1000-shrines-of-spirit/src/0006/index.html`
**Board Last Updated:** 2026-09-12 19:15 by Claude

### Branding (user-confirmed)

- **Font:** the bundled Medodica Regular (`MedodicaRegular.otf`), exposed as the
  `"Medodica"` CSS family. (User wrote "Melodica"; the asset/upstream family is
  Medodica — flag if the file should be renamed.)
- **Light theme is the default** (the `System` option is removed). Light uses
  the brand green `#6cd73c` on `#ffffff` panels.
- **Dark theme** remains available via the header toggle; choice persists in
  `localStorage`.

### How this backlog was produced (2026-09-12 18:10)

A fresh parity audit compared the Electron port against:
1. the Rust `manage/KANBAN.md` "Technical Handoff Notes" (the authoritative
   feature description of the shipped Rust app),
2. every Rust Completed card (`0006-PLAN-001..031`, `0006-BUG-001..008`,
   `0006-DONE-001..007`, `0006-IDEA-001..003`),
3. `PARITY.md`'s functional checklist and "Audio and editor behaviours" list,
4. direct inspection of `lantern-app/src/{app,pattern,editor,cover}.rs`.

Cards below are **features present in Rust but missing or partial in the
Electron port**. Rust's own only-open item — `0006-PLAN-025`'s `.FUR` writer —
is *also* unimplemented in Rust (both apps passthrough the loaded bytes), so it
is captured as an optional card, not a parity gap.

### Technical Handoff Notes

- **Porting map (Rust -> TS):**
  | Rust | TS location |
  | --- | --- |
  | `lantern-fur` | `src/core/fur/` |
  | `lantern-core` | `src/core/{songModel,timing,pitch,sampler,spectral,project,export,midi,dsp,tracker}.ts` |
  | `lantern-audio` (web) | `src/audio/{backend,webSampler,webAudioBackend}.ts` |
  | `lantern-app` | `src/renderer/` (React) |
  | `prism_dsp` | `native/prism-wasm/` -> `src/renderer/vendor/prism/` + `src/wasm/{prism,prism.worker,prismWorkerClient,prismWorkerProtocol}.ts` |
  | folder/file I/O | `src/main/` + `src/preload/` |
- **Dropped by design:** native `rodio` backend, `eframe` storage, `trunk`
  packaging, `System` theme.
- **Byte-format contracts:** WAV PCM16 (LE asymmetric scaling), ZIP STORE
  (DOS date `0x0021`, CRC-32), MIDI (`TICKS_PER_ROW = 24`, big-endian, no
  running status), Project JSON v1 (camelCase, legacy `rootNote` migration,
  Rust serde `NoteValue` encoding), cover PRNG seed `9001`, offline mixdown
  PRNG seed `"LANTERN\x01"`.
- **WASM build:** `npm run build:prism-wasm` uses `wasm-bindgen-cli` after
  `cargo build --target wasm32-unknown-unknown`; output committed under
  `native/prism-wasm/pkg/` and copied to `src/renderer/vendor/prism/`.

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

### Verification baseline (2026-09-12 18:40)

- `npm run typecheck` — clean.
- `npx vitest run` — **6 files, 37 tests passing**, including the real
  `prism_dsp` WASM engine (freeze + cross-synth) instantiated in-process.
- `npm run audit:deps` — 40 checks passed, 0 failures; 172 transitive lockfile
  packages registry-resolved with sha512.
- `npm run build` — renderer 326 kB JS + 326 kB WASM (102 kB gzip) + hashed font.
- `npx playwright test` — 3 tests: smoke (load/theme/JSON), EDIT MODE
  (select/navigate/edit), and editor (waveforms + close button).

---

## Ideas

- **0007E-IDEA-001** — Spectrogram/FFT inspector panel using prism_dsp frames.
- **0007E-IDEA-002** — `electron-builder` packaging; compress/generate the
  ~38 MB CHIP mix WAV. (Rust: `0006-PLAN-006` was scrapped; user deploys.)
- **0007E-IDEA-004** — Additional Furnace chip-system support beyond Game Boy.
  (Rust `0006-IDEA-001`; out of current parity scope.)
- **0007E-IDEA-005** — Persistent Fusion render cache keyed by source + settings
  fingerprint. (Rust `0006-IDEA-002`.)
- **0007E-IDEA-006** — Mobile-focused compact layout validated on real mobile
  browsers. (Rust `0006-IDEA-003`.)

## Bugs

_(none open — see 0007E-BUG-001…007 in Completed)_

## Planned Features — Remaining Rust parity backlog

All tracked Rust-parity cards except the optional Rust-deferred `.FUR` writer
have now landed.

- **0007E-PLAN-051** — *Optional (mirrors Rust's own open item):* **Save .FUR
  writer from live editor state** (splice SNG2/PATN, recompute the block-pointer
  table, re-wrap in zlib). Rust deliberately deferred this because it could not
  validate against a real Furnace install; both apps currently pass through the
  loaded bytes. Verify against a real Furnace build before trusting it.

## Assigned

_(none currently)_

## Completed

- **0007E-PLAN-000** — Architecture analysis. *(2026-09-12 17:10)* Mapped all
  four Rust crates + `prism_dsp`; confirmed Electron/Chromium → port the web
  backend, drop `rodio`.
- **0007E-PLAN-001** — Scaffold. *TS 7 removed `baseUrl`; paths are `./src/*`.*
- **0007E-PLAN-002/003/004** — Core ports: `.fur` parser (INF2/SNG2/ADIR/INS2/
  WAVE/PATN/legacy INFO), song model + timelines, timing, pitch, sampler
  settings + look-ahead `Scheduler`, project v1 schema, WAV/ZIP, MIDI writer,
  offline `renderSamplerMix`. Verified against the v251 and v181 fixtures.
- **0007E-PLAN-005** — Unit tests (parser, model, scheduler, envelopes,
  ping-pong, project, WAV/ZIP, MIDI, mixdown, tracker helpers, WASM).
- **0007E-PLAN-006/007/008** — Web Audio backend + React vertical slice +
  Electron main/preload; verified by E2E.
- **0007E-PLAN-009/010** — Slopsquatting dependency audit + Playwright E2E.
- **0007E-PLAN-011b** — prism_dsp WASM build + Spectral wiring (8 modes).
- **0007E-PLAN-012** — Cover art, piano visualiser, Light/Dark theming.
- **0007E-PLAN-013** — Tracker EDIT MODE (selection/keybinds/copy/paste/
  interpolate/Pattern Manager/undo-redo).
- **0007E-PLAN-014** — Sampler + Spectral editor windows.
- **0007E-PLAN-015** — Folder-load / song-swap.
- **0007E-PLAN-016** — Exports/IO (FUR/MIDI/JSON/WAV/ZIP).
- **0007E-PLAN-017** — Transport/audition/sample waveforms.
- **0007E-PLAN-018** — Source Sample windows.
- **0007E-BUG-001** — 2-byte `tagEquals` bug. Fixed; regression-tested.
- **0007E-PLAN-019/021/022/023/024/025 — Sidebar chrome.** *(2026-09-12 18:15)*
  Hover Explainer card (shared React context, wired to tracker cells/rows/
  channels and mixer/instrument hovers), Song Comments, editable-in-EDIT-MODE
  Timing card (BPM + tick rate/speed/virtual tempo/highlights applied live and
  retimed), Chips card, Licenses + page links, and editable Title/Artist/Album.
- **0007E-PLAN-027/028/029/030 — Quick edits.** *(2026-09-12 18:15)* Editable
  channel/master dB text fields (commit on Enter/blur, `-∞` support), editable
  instrument colour swatch, name, and dB volume.
- **0007E-PLAN-033/034/035/036 — Tracker improvements.** *(2026-09-12 18:15)*
  X clears an active range; plain Space starts from the viewed pattern's row 0
  with Ctrl+Space resuming; "Order" renamed to "Pattern" with a current-pattern
  colour swatch; beat/bar guide lines now follow `highlight_a`/`highlight_b`.
- **0007E-PLAN-041/042/043/044/045 — Editor completeness.** *(2026-09-12 18:15)*
  Freeze-point waveform drag (A and B); shared Spectral ENVELOPE section;
  Spectral Result waveform with status and playheads; fusion lifecycle (render
  then re-trim, `setSpectralEnabled` on tab/pill switch, Project JSON import
  reconstructs renders preserving saved trim); tab↔pill engine sync.
- **0007E-BUG-002 — Tracker selection invisible.** *(2026-09-12 18:10)* Cell
  `className` had dropped the `tracker-cell` class, so `.tracker-cell.selected`
  / `.tracker-cell.in-range` never matched and EDIT MODE looked non-functional.
  Fixed by prefixing every tracker cell with `tracker-cell`; regression test
  `tests/e2e/edit.spec.ts` verifies select/navigate/edit.
- **0007E-BUG-003 — Sampler/Spectral close button dead.** *(2026-09-12 18:10)*
  The title-bar drag handler called `setPointerCapture` on pointerdown, which
  retargeted the subsequent `click` away from the ✕ button. Fixed by ignoring
  pointerdowns originating on a button and stopping propagation on the close
  button; regression test `tests/e2e/editor.spec.ts`.
- **0007E-BUG-004 — "Unmute" UI hang.** *(2026-09-12 18:25)* Mitigated: per-panel
  frame updates throttled, `songPositionAt` no longer allocates a `rowTimes`
  slice per call, and Spectral re-render is guarded to genuine Spectral
  param/source changes. Feel should be re-confirmed on the user's machine.
- **0007E-BUG-005 — Scroll-while-playing hang.** *(2026-09-12 18:25)* Mitigated
  by the same throttling: Mixer/Transport/PatternGrid at 20 fps,
  Piano/SourceSamples at 12 fps, Piano skips idle frames, SourceSamples
  de-dupes duration updates.
- **0007E-BUG-006 — Spectral Sample A source picker missing.** *(2026-09-12
  18:25)* Added a Sample A Source selector to the Spectral tab.
- **0007E-PLAN-026 — Persistent local editor state.** *(2026-09-12 18:25)*
  Mutes, instrument display names/colours and Ref Pitch persist to
  `localStorage` (`lantern-local-state-v1`) and restore over the project on load.
- **0007E-PLAN-031 — Transpose preview.** *(2026-09-12 18:25)* Table −/+ now
  clamp and preview via `onTransposeAdjust`.
- **0007E-PLAN-032 — CHIP-mode instrument preview.** *(2026-09-12 18:25)* In CHIP
  mode, instrument Preview finds a pattern occurrence (`findInstrumentSpot`)
  and auditions the stem slice.
- **0007E-PLAN-037 — Tracker note-trigger flashes.** *(2026-09-12 18:25)* Note
  starts briefly outline the cell in the accent colour.
- **0007E-PLAN-039 — Per-column interpolate menu.** *(2026-09-12 18:25)* One
  Interpolate entry per selected column.
- **0007E-PLAN-046 — Clear Samples resets editor state.** *(2026-09-12 18:25)*
  Also resets ADSR to the defaults.
- **0007E-PLAN-050 — Theme-following waveform colours.** *(2026-09-12 18:25)*
  Waveforms read the `--wave` theme variable.
- **0007E-PLAN-020 — Cross-channel range selection.** *(2026-09-12 18:40)*
  `tracker.ts` now exposes a global flat-column space (`flatColumns`,
  `globalColumnIndex`, `columnInRect`) and `selectionRect` spans channels.
  Shift-select, Ctrl+C/V + flood paste, X-range-clear, interpolate and Ctrl/Cmd+A
  all operate across channels; unit test asserts a CH0→CH1 rectangle and
  `inSelection` membership.
- **0007E-PLAN-038 — Frozen multi-row tracker headers.** *(2026-09-12 18:40)*
  Both header rows use explicit non-overlapping sticky offsets (0 / 28px) and
  the channel header `colSpan` now tracks the real effect-column count.
- **0007E-PLAN-040 — Draggable ADSR graph.** *(2026-09-12 18:40)* New
  `AdsrGraph` renders the envelope with three draggable handles (attack,
  decay/sustain, release), alongside the numeric sliders; E2E asserts the
  handles render.
- **0007E-PLAN-047 — Per-panel audio errors.** *(2026-09-12 18:40)* New
  `AudioError` component polls the backend and shows a red inline label under
  the player; no longer only the global banner.
- **0007E-PLAN-048 — Legacy Project JSON compatibility.** *(2026-09-12 18:40)*
  Import now falls back to the legacy `spectralFusion` object, aliases the old
  `spectral-blend` mode to `cross-synth`, and maps unknown modes to `off`
  instead of producing an invalid value; covered by a unit test.
- **0007E-PLAN-049 — Export filename parity.** *(2026-09-12 18:40)* Package
  Samples, sampler WAV and Project JSON filenames now match the Rust fallbacks
  (`project.songTitle`, else the Rust default string) exactly.
- **0007E-BUG-007 — `Z` key ("enter last value") was dead code.** *(2026-09-12
  19:15)* Found during a fresh parity pass: `PatternGrid.tsx`'s `z` handler
  read the current cell's value and discarded it, writing back an unchanged
  cell, even though the Keyboard Help modal advertised "enter last value /
  repeat." Fixed by porting Rust's per-column-type memory
  (`lantern-app/src/pattern.rs`'s `last_note`/`last_ins`/`last_vol`/`last_fx`,
  defaulting to C-4/0/15/`{0,0}`) into `src/core/tracker.ts` as
  `defaultLastValues`/`recordLastValue`/`applyLastValue`, hooked into
  `PatternGrid.tsx`'s shared `commit()` (used by both keybind edits and the
  right-click menu, matching Rust's `commit_edit`) so paste/interpolate still
  do not affect it. Covered by new cases in `tests/unit/tracker.test.ts`.
- **0007E-PLAN-052 — Sidebar width parity.** *(2026-09-12 19:15)* `.sidebar`
  was 320px; the Rust/original spec is 300px. One-line CSS fix.
- **0007E-PLAN-053 — Spectral Worker (was 0007E-IDEA-003).** *(2026-09-12
  19:15)* `prism_dsp` Spectral renders now run in a dedicated Web Worker
  (`src/wasm/prism.worker.ts` + `prismWorkerClient.ts`, request/response
  protocol in `prismWorkerProtocol.ts`) instead of blocking the main thread;
  `initPrismWasm` tries the Worker first and falls back to the previous
  main-thread WASM path if the Worker can't start. This finally gives real
  meaning to `AudioBackend`'s `fusionRendering`/`takeFusionCompleted`, which
  every implementation (Rust and TS) had hardcoded to `false`/no-op since
  rendering was always synchronous — `SamplerEngine.renderSpectral` now
  tracks per-instrument in-flight/completed state and discards stale results
  when a newer render supersedes an older one for the same instrument.
  `SamplerEditor`'s Spectral tab shows "Rendering…" and disables Render while
  a render is in flight. Verified end-to-end in the built app (Playwright):
  Render correctly shows "Rendering…" then "Rendered result is ready.", no
  console errors, no Worker-init fallback warning logged. New tests:
  `tests/unit/prism-worker-client.test.ts` (protocol, injected fake
  transport), `tests/unit/webSampler.test.ts` (stale-render discard).

---

_Add new cards at the bottom of their bucket; move them rather than copy._
