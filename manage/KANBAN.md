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
**Board Last Updated:** 2026-09-12 18:25 by opencode

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
  | `prism_dsp` | `native/prism-wasm/` -> `src/renderer/vendor/prism/` + `src/wasm/prism.ts` |
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

### Verification baseline (2026-09-12 18:15)

- `npm run typecheck` — clean.
- `npx vitest run` — **6 files, 35 tests passing**, including the real
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
- **0007E-IDEA-003** — Web Worker hosting the prism_dsp WASM module if inline
  rendering ever blocks a frame (documented Rust fallback).
- **0007E-IDEA-004** — Additional Furnace chip-system support beyond Game Boy.
  (Rust `0006-IDEA-001`; out of current parity scope.)
- **0007E-IDEA-005** — Persistent Fusion render cache keyed by source + settings
  fingerprint. (Rust `0006-IDEA-002`.)
- **0007E-IDEA-006** — Mobile-focused compact layout validated on real mobile
  browsers. (Rust `0006-IDEA-003`.)

## Bugs

- **0007E-BUG-006** — **SpectralPrism: cannot choose Sample A's Source Sample.**
  *Symptom:* the Spectral tab only exposed a Sample B source picker.
  *Fix:* added a Sample A source selector bound to the instrument's
  `sourceIndex`, rebuilding the render on change. *Status:* fixed (see
  Completed).

_(Resolved bugs are moved to Completed, keeping their IDs.)_

## Planned Features — Remaining Rust parity backlog

Backlog after the 2026-09-12 third pass.

- **0007E-PLAN-020** — **Cross-channel range selection.** Extend the tracker's
  flat-column space so Shift selection, copy/paste/flood-paste, X-clear-range,
  interpolate and Ctrl/Cmd+A operate across channels. *Rust:* `pattern.rs`
  `flat_columns` is global; `selection_rect` stores flat `col_lo/col_hi`.
- **0007E-PLAN-038** — **Frozen multi-row grid headers.** Verify/fix both
  sticky header rows during body scroll (Rust `TableBuilder` pinned header).
- **0007E-PLAN-040** — **Draggable ADSR graph.** Draw the envelope with
  draggable attack/decay/sustain/release handles (keeping the sliders).
  *Rust:* `editor.rs` `adsr()`.
- **0007E-PLAN-047** — **Per-panel audio errors.** Surface decode/render errors
  in the relevant player/editor panel, not only the global banner.
- **0007E-PLAN-048** — **Legacy Project JSON compatibility audit** for the
  pre-`prism_dsp` Fusion schema and `rootNote`.
- **0007E-PLAN-049** — **Export parity details** (runtime CHIP mix naming,
  `.FUR` passthrough, Package Samples numbered WAV names).
- **0007E-PLAN-051** — *Optional (mirrors Rust's own open item):* **Save .FUR
  writer from live editor state** (splice SNG2/PATN, recompute block pointers,
  zlib re-wrap). Rust deliberately deferred this; both apps currently pass
  through the loaded bytes.

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

---

_Add new cards at the bottom of their bucket; move them rather than copy._
