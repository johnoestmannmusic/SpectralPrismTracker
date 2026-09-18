# Project Kanban

<!-- Source of truth for project coordination. Managed by the KANBAN-MANAGE tool; safe to edit by hand. -->

## Project overview

**Lantern** is a standalone terminal music tracker/sampler. It is its own format and engine — it does not read or write any external tracker format. Projects are `.lampjson` (version 1 JSON) with a pattern snapshot and Source Sample references.

**What it does**

- 4-channel pattern tracker (NOTE / INS / VOL / FX per channel, multiple FX columns) with playback, follow mode, block selection, clipboard, transpose, interpolation and order/pattern management.
- **Cycles Mode** (`C` / `/cycles`): per-channel order lengths that loop independently (song loop = LCM), per-channel phase offset, playback speed and tape-drift detune, plus a centred per-channel performance view. **Ghost rows** (`/ghosting`, off by default) show the surrounding orders above/below the window.
- Glitch-event FX include `10xx` trigger chance, `11xx` ratchet, `12xx` reverse, `13xx` sample offset and `14xx` hold/freeze; the tracker's Enter-on-FX menu picks the type.
- Song timing is a single **BPM** plus beat/bar row highlighting; row duration is `60 / (bpm * beatRows)`. `09xx`/`0Axx` raise/lower the running BPM. `/info` opens an editable Song Info menu (title, credits, links and the BPM/beat/bar controls).
- Per-instrument chain **Sampler → Spectral → Percussion → Chord → MicroTextures** (each stage is independent and optional): Spectral fusion, Percussion one-shot post-stage, Chord voicing, and a MicroTextures granular stage (grain/density/chaos, formant shift, retrigger, bit-crush). Per-instrument **Choke** hard-cuts the previous voice.
- A mixer, master FX (delay/reverb), and a **WAV export modal** (`/export wav`) with loops / fade in / fade out / peak normalize and a Cycles track-length cap.
- Song info, Source Samples (with waveform previews), cover art, WAV/MIDI/ZIP/PNG export.
- A Stepthrough tutorial (`/stepthrough`) that rebuilds the bundled project as a navigable recipe, and a live control socket for scripts/agents.

**Architecture**

- `src/core/` — framework-free domain: `songModel` (builds a playable model from a project snapshot), `tracker` edit ops, `project` (`.lampjson` serde), `sampler`/`spectral`/`percussion`/`dsp`, `masterFx`, `timing`, `export`, `stepthrough`, `coverArt`. No file-format parser.
- `src/audio/` — `WebAudioBackend` over `node-web-audio-api` + `webSampler`; `src/wasm/` — the Prism DSP via a Node worker thread (optional; falls back to plain samples).
- `src/tui/` — Ink UI. `session.ts` is the single action surface (state + every mutation); `commands/` is the slash-command registry (fuzzy + Tab completion) that both the UI and the control socket drive; components render tracker/menus/explainer/status.
- `src/runtime/` — asset loading, path/file IO, and `config.ts` (user config). `src/control/` — Unix-socket control channel. `src/shared/` — cross-layer types.
- `src/host/` — platform seam (`Host` interface) so `src/tui` never imports `node:` directly: `node/` is the desktop host, `browser/` is the fetch/OPFS/IndexedDB host. `src/web/` — web deployment: `main.tsx` is the static xterm.js frame, `server.tsx` streams the same Ink TUI over SSE (HC003).

**Run / test**

- `npm run dev:tui` (build + run), `npm run start:tui`, `npm test`, `npm run typecheck`, `npm run build:tui`.
- Web: `npm run build:web` (static `dist/web` + host `dist/web-host`), `npm run serve:web` (host on `127.0.0.1:8123`), `npm run test:web` (Playwright E2E).
- `npm run run:script -- <file.lmpscript>` drives the running app over the control socket; see `examples/`.

**Conventions**

- Put behaviour in `Session` (and pure helpers in `src/core`) and expose it as a command; the TUI and scripts then share one implementation.
- Keep `src/core` free of Node/DOM/Ink imports so it stays testable.
- The command registry is the automation contract: structured results, no Ink coupling.

**Persistence / startup**

- User config: `~/.config/lantern/config.json` (`LANTERN_CONFIG` or `XDG_CONFIG_HOME` override). Stores `lastProject` and `defaultOpen`.
- Autosave: every 15 mutating actions the live project is written to `<config dir>/backup.lmpjson`; `/restore [path]` reloads it. Navigation/transport/selection do not count.
- Startup: `defaultOpen.file` (pinned file) > `off` (always bundled default) > `lastProject` > bundled default. `/default-open-override <file|off|last>` controls it; open/save record the last project.
- `/open` and `/save` are `.lampjson` only.

## Features

## Bugs

## In Progress

## Blocked

## Implemented

### FEAT-114 — CYCLES MODE — Glitch Ambient workspace
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, epic
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: epic

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Cards**
- FEAT-115 — Cycles Mode workspace toggle + Glitch defaults + reachability
- FEAT-116 — Per-channel order lengths: model, snapshot & project serialization
- FEAT-117 — Per-channel order lengths: LCM timing, scheduler & sequence wrapping
- FEAT-118 — Per-channel order lengths: tracker UI + order editing
- FEAT-119 — Phasing: per-channel start offset + playback speed
- FEAT-120 — Chord mode: settings model, project serde & editor tab
- FEAT-121 — Chord mode: TS voicing expansion, voice groups & realtime/offline parity
- FEAT-122 — MicroTextures DSP: Rust granular + formant filter + WASM binding
- FEAT-123 — MicroTextures: settings model, project serde & editor tab
- FEAT-124 — Tone/space: formant presets, micro-detune drift, bitcrush & freeze/hold
- FEAT-125 — Glitch events: probability, ratchet, reverse & sample-offset FX
- FEAT-126 — Master stutter / beat-repeat FX
- FEAT-127 — Stepthrough, docs/REACHABILITY & KANBAN overview update
- FEAT-128 — Cycles demo project + walkthrough + end-to-end & constraint verification

### FEAT-128 — Cycles demo project + walkthrough + end-to-end & constraint verification
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, testing, demo, constraints
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Ship a bundled Cycles demo .lampjson showcasing LCM phasing, a Chord instrument and a MicroTextures instrument. Add unit tests (per-channel serialization round-trip, LCM timing, chord expansion/voice-group release, probability determinism, per-channel speed drift) and a Playwright/desktop smoke path. Run the full gate: typecheck, vitest, lint, format, audit:deps, build:tui, build:web, constraints_validate, constraints_run_tests, and the reachability test. Fix blocking failures before marking Implemented.

**Architecture**
assets/ demo project, tests/unit/*, tests/e2e, constraints-tests/, package.json test:all.

**Key decisions**
- Demo is the acceptance vehicle for the whole phase.

**Depends on**
- Per-channel order lengths: LCM timing, scheduler & sequence wrapping
- Phasing: per-channel start offset + playback speed
- Chord mode: TS voicing expansion, voice groups & realtime/offline parity
- MicroTextures: settings model, project serde & editor tab
- Glitch events: probability, ratchet, reverse & sample-offset FX

**Acceptance criteria**
- Demo loads and plays phasing + chord + microtextures.
- All unit tests pass; LCM and chord tests are meaningful (not skipped).
- constraints_validate and constraints_run_tests pass with no un-reviewed manual rules.
- npm run test:all green.

### FEAT-127 — Stepthrough, docs/REACHABILITY & KANBAN overview update
- priority: medium
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, docs, stepthrough, hc002
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Extend the Stepthrough tutorial with a Cycles chapter walking through per-channel order lengths, Chord, MicroTextures and the phasing/glitch controls. Update docs/REACHABILITY.md and the OVERLAYS list for every new overlay/param group. Update the KANBAN.md Project overview to describe Cycles Mode and the new instrument chain.

**Architecture**
src/core/stepthrough.ts, docs/REACHABILITY.md, tests/unit/reachability.test.ts, KANBAN.md Project overview.

**Key decisions**
- Every new overlay gets a <=2-press documented path.

**Depends on**
- Per-channel order lengths: tracker UI + order editing
- MicroTextures: settings model, project serde & editor tab
- Chord mode: settings model, project serde & editor tab

**Acceptance criteria**
- Reachability test green with the new overlays.
- Stepthrough covers each new feature.
- Overview text matches shipped behaviour.

### FEAT-132 — Tracker context rows: preview adjacent orders above/below the current order
- priority: medium
- tags: tracker, tui, patterns, playability
- created: 2026-09-18
- updated: 2026-09-18

User request: in the Pattern Editor, transparently show the previous and next ~16 rows of the previous/next orders either side of the current active order, in each channel column, so you can see what is coming before the view scrolls to it.

**Approach**
- In `PatternView`'s normal (aligned editor) view, render dim "context rows" outside the current order's row range:
  - Above the current order: the trailing up-to-16 rows of the **previous order's** pattern (per channel).
  - Below the current order: the leading up-to-16 rows of the **next order's** pattern (per channel).
- Per channel: adjacent orders must come from each channel's own order list (and wrap its cycle), because order lengths differ (Cycles). Reuse `channelPatternAt`/timeline indexing; the "next" order for channel c is `orderList[(viewOrder + 1) % channelLen]`, "previous" is `(viewOrder - 1 + len) % len`.
- Rows are read-only context: no cursor, no selection, no editing; render dim/grey (and skip instrument tint, or use a much fainter tint).
- Only show context rows when the viewport is actually at the top/bottom edge of the current order (i.e. `startRow === 0` / `endRow === patternLength`), otherwise they would be misleading. When present they occupy viewport rows, reducing the number of editable rows shown.
- Gate behind a toggle (default on?) so it can be turned off; must be reachable within 2 presses (e.g. a key like `y` and/or `/contextrows on|off`, documented in docs/REACHABILITY.md).
- In Cycles Mode's centred performance view the layout is intentionally fixed-centre, so context rows are not shown there (or are shown only in the aligned editor).

**Architecture**
- `src/tui/components/PatternView.tsx` — render context rows above/below; new prop `contextRows?: boolean`; compute per-channel adjacent patterns.
- `src/tui/session.ts` — a `contextRows` boolean setting + setter (and maybe a command).
- `src/tui/commands/builtins.ts` + `src/tui/commands/types.ts` if exposed as `/contextrows`.
- `docs/REACHABILITY.md` + `tests/unit/reachability.test.ts` if a new overlay/key is added.

**Decisions**
- Per-channel adjacent orders (not a single global order), so it stays correct with per-channel order lengths.
- Read-only dim rows; the edit grid and cursor are unchanged.

**Alternatives considered**
- Showing all surrounding orders (previous+current+next in full): rejected — too much vertical space and confusing.
- Following the playhead only: rejected — this is about seeing ahead while editing/stopped.

**Open questions**
- Should the context row count be configurable (8/16/32), and does it belong at the top of the tracker, bottom, or both?
- Should the previous/next *order number* be labelled (e.g. a dim "▲ order 04" / "▼ order 06" divider line)?
- Default on or off?

**Acceptance criteria**
- With the toggle on, scrolling the viewport to the top of an order shows the previous order's trailing rows (dim) above row 0; at the bottom it shows the next order's leading rows below the last row — per channel.
- Context rows never receive the cursor/selection and are visually distinct (dim).
- Toggle reachable within 2 presses and documented.
- No measurable slowdown in `PatternView` (bounded extra `cellAt` reads).
- Typecheck/lint/tests/constraints green.

### FEAT-124 — Tone/space: formant presets, micro-detune drift, bitcrush & freeze/hold
- priority: medium
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, tone, fx, audio
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Wire the approved tone/space ideas: expose formant vowel presets (from the Rust filter) in the editor; add per-channel micro-detune/tape-drift (slow random cents offset applied at voice build time, mirrored offline); add a bitcrush/downsample effect (reuse the Rust microtexture bitcrush or a TS FX code); add a freeze/hold note action that captures the current Spectral freeze and sustains it. Keep each reachable within 2 presses.

**Architecture**
src/core/sampler.ts (detuneDrift), src/audio/webSampler.ts + src/core/export.ts (drift parity), src/core/spectral.ts (freeze/hold), src/tui/editors.tsx, src/tui/session.ts, docs/REACHABILITY.md.

**Key decisions**
- Bitcrush lives in the Rust microtexture path; detune drift is cheap TS per-voice.

**Open questions**
- Is freeze/hold a held key, an FX column command, or a dedicated transport toggle?

**Depends on**
- MicroTextures DSP: Rust granular + formant filter + WASM binding

**Acceptance criteria**
- Formant presets change timbre predictably.
- Detune drift is subtle and identical in realtime and export.
- Freeze/hold is reachable and releases cleanly.

### BUG-30 — Pattern Manager selection needed a channel switch before arrows worked
- priority: high
- tags: patterns, tui, cycles
- created: 2026-09-18
- updated: 2026-09-18

User report: after opening the Pattern Manager with `p`, the up/down selector did nothing until switching channels back and forth.

Cause: the manager now opens on the tracker's cursor channel, but `selected` initialised from the global `viewOrder`, which can exceed that (shorter) channel's order length. The raw selection was out of range, so ↑ was a no-op (clamped display hid it); switching channels reset `selected` to 0.

Fix: clamp the raw selection whenever the channel's `listLength` changes (including on open) via an effect, and make ↑/↓ move relative to the clamped value. 297 tests pass (added a test that opens on a 2-order channel at viewOrder 4 and moves up immediately).

### FEAT-125 — Glitch events: probability, ratchet, reverse & sample-offset FX
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, glitch, tracker, fx
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Add new FX codes in the tracker catalog (extending FX_CATALOG): probability/trigger chance, ratchet (N retriggers within the row), reverse sample playback, and sample start-offset. Implement in sequenceFromSong (probability via a seeded PRNG so realtime and export agree; ratchet expands to sub-row events; reverse/offset carried on the note event) and consume in webSampler + renderSamplerMix. Show them in the tracker FX help and explainer.

**Architecture**
src/core/tracker.ts (FX_CATALOG), src/core/sampler.ts (SamplerEvent fields, expansion), src/audio/webSampler.ts, src/core/export.ts, src/tui/explainer.ts, src/tui/format.ts (FX display).

**Key decisions**
- Probability uses a fixed PRNG seed so WAV export matches playback.
- New behaviours are FX codes, not new pattern columns, to preserve the file format and the 2-press budget.

**Alternatives considered**
- Dedicated probability/ratchet columns: rejected — schema + width churn.

**Open questions**
- FX code allocation: pick unused hex codes; confirm no collision with 01/02/09/0A.

**Depends on**
- Chord mode: TS voicing expansion, voice groups & realtime/offline parity

**Acceptance criteria**
- FX help lists the new codes with descriptions.
- Probability is deterministic across realtime and export.
- Ratchet produces N evenly spaced triggers within the row.

### BUG-29 — Duplicate preview used a shifted render index; percussion stopped when spectral was off
- priority: critical
- tags: instrument, render, percussion, spectral, cycles
- created: 2026-09-18
- updated: 2026-09-18

Two user reports:
1. After duplicating an instrument, previewing it played the wrong instrument until Perc mode was toggled.
2. Turning Spectral off stopped Percussion too — chain stages must be independent.

Cause 1: `WebAudioBackend.replaceSettings` (called on add/delete/duplicate) set the new settings and cleared loop caches but did NOT clear the index-keyed baked renders (`fused`/`fusedClips`/`fusedWaveforms`). Inserting a duplicate shifted the array, so index N read the previous instrument N's render. Also `duplicateInstrument` (and add/delete) re-published the sequence with the stale `this.state.settings`.
Cause 2: render gating only checked `spectral.enabled || microTextures.enabled`, so a percussion-only instrument never baked a render.

Fixes:
- Added `SamplerEngine.resetRenders()`; `replaceSettings` now clears all baked renders. Session `applyInstrumentSettings()` re-publishes the sequence with the new settings and re-renders every enabled stage; used by load/add/delete/duplicate.
- Added `spectralRenderEnabled(settings)` = `enabled || percussion.enabled || microTextures.enabled` and used it at every render/preview gate (webSampler spectralActive/decode/render guard, webAudioBackend replaceSample, session load/setting/preview/collect/stepthrough).

Tests: `spectralRenderEnabled` truth table, `resetRenders` clearing, duplicate re-publishes the sequence. 289 tests pass; constraints green.

### BUG-28 — Duplicating a pattern reset its row count to 64
- priority: high
- tags: cycles, patterns, duplicate, tracker
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-129 follow-up): duplicating a pattern in Cycles Mode reset its row count back to 64 instead of copying the source pattern's rows.

Cause: `insertPatternInChannel` pushed the new snapshot pattern as `[index, rows]`, omitting the optional `rowLength`/`name` tail. `applySnapshot` then defaulted rowLength to `song.meta.patternLength` (64).

Fix: the tuple now carries the source pattern's `rowLength` and `name` on duplicate (and the song default for a fresh pattern): `[nextIndex, rows, rowLength, name]`.

Test: added a tracker test asserting a duplicated 8-row named pattern keeps rows=8 and name after `applySnapshot`. 283 tests pass.

### BUG-27 — Clipped editor rows; grain chaos changed pitch instead of timbre
- priority: high
- tags: microtextures, tui, granular, chaos
- created: 2026-09-18
- updated: 2026-09-18

User report (MicroTextures follow-up):
1. The "Density mod depth" row appeared invisible.
2. Grain chaos changed grain tuning; it should change per-grain timbre instead.

Cause 1: ParamEditorOverlay computed `visibleRows = height - 3`, but the instrument tabs add an extra chrome row, so the last visible row(s) overflowed and were clipped by the box border. With the 5-tab bar, "Density mod depth"/"Grain chaos" were cut off.
Cause 2: grain chaos added a random pitch offset to each grain.

Fixes:
1. `visibleRows` now subtracts chrome rows including the tab bar (and filter line): `3 + (tabs?1:0) + (filter?1:0)`. Non-tab overlays are unchanged.
2. Grain chaos now varies per-grain timbre: a random one-pole low-pass cutoff, per-grain bit reduction, per-grain sample-and-hold downsampling, plus random reverse/pan/gain/length. It no longer touches pitch (only `pitchScatter` moves tuning). Rebuilt the WASM.

Verified in the full App that "Density mod depth" and "Grain chaos" render. 282 tests pass; cargo test microtextures passes.

### BUG-26 — MicroTextures was registered nowhere, so the DSP never ran
- priority: critical
- tags: microtextures, wasm, audio, cycles
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-122/123): MicroTextures parameters were visible but made no audible difference.

Cause 1 (main): none of the four WASM registration points included the newly generated `render_microtextures` export — `prismNode.ts`, `prism.worker.node.ts`, `prism.worker.ts`, `host/browser/prism.ts` each hard-code the module surface. So `wasm.render_microtextures` was undefined and `makeSpectralRenderer` silently skipped the stage (it is optional for older builds).
Cause 2: `Session.updateSamplerSetting` only kicked off a render when `spectral.enabled` was true, and preview/render gates at several call sites ignored `microTextures.enabled`, so enabling MicroTextures alone never rendered the instrument.

Fixes:
- Added `render_microtextures` to all four WASM module registrations (Node main-thread, Node worker, browser worker, browser main-thread).
- All render/preview gates now use `spectral.enabled || spectral.microTextures.enabled` (load, setting change, preview-after-render, collectNotes, previewBuildStep, stepthrough engine sync).

Test: added a regression that registers the real Node host (`initPrismWasmNode`) and asserts `spectralRender` with microTextures enabled differs from the plain render (it would be identical before the fix). 282 tests pass.

### FEAT-126 — Instrument-level stutter / beat-repeat (inside MicroTextures)
- priority: medium
- tags: cycles, fx, microtextures, instrument, rust, wasm
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

RE-SCOPED by user (2026-09-18): stutter is NOT a master-bus effect. It must happen at the instrument level, and should live inside the MicroTextures stage of the instrument chain (Sampler → Spectral → Percussion → Chord → MicroTextures).

Revised approach:
- Add stutter/beat-repeat controls to the MicroTextureSettings block (enable, division/rate, mix, feedback/decay, probability), rendered as a MicroTextures sub-group.
- Implement it in the Rust/WASM microtexture render (native/prism_dsp) so it is baked per instrument, alongside the granular/formant/bitcrush work — i.e. it becomes part of FEAT-122/FEAT-123 rather than a separate master FX.
- Expose per-instrument controls in the MicroTextures editor tab; keep reachable <=2 presses.
- Remove the MasterFxSettings/masterFxGraph approach from the original plan.
- Offline WAV export uses the rendered microtexture clip (same lifecycle as Spectral/Percussion), so no separate export path is needed.

Supersedes the original "Master stutter / beat-repeat FX" card content below.

### FEAT-123 — MicroTextures: settings model, project serde & editor tab
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, microtextures, instrument, project
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Add `MicroTextureSettings` to SamplerSettings: enabled, grain size, density, jitter, reverse probability, pitch scatter, pan scatter, retrigger count/rate, volume variance, envelope shape, bit-crush/downsample, formant vowel + F1/F2 + resonance + mix. Wire defaults, serde, the editor tab after Chord (microtextureGroups), the InstrumentTab union + instrumentTabFor, an `overlay:microtextures` entry, `/microtextures` command, and SamplerEngine.renderMicroTextures (cached like spectral/percussion) so `effectiveClip` feeds offline export.

**Architecture**
src/core/sampler.ts (MicroTextureSettings), src/core/project.ts (serde), src/tui/editors.tsx (microtextureGroups), src/tui/commands/types.ts, builtins.ts, src/tui/App.tsx, src/audio/webSampler.ts (renderMicroTextures + effective clip), src/host/browser/prism.ts / node worker wiring.

**Key decisions**
- Baked at instrument-render time (same lifecycle as Spectral/Percussion); retriggers are gated inside the render.

**Alternatives considered**
- Per-note granular scheduling in TS: rejected — DSP belongs in Rust per user.

**Open questions**
- Should MicroTextures auto-enable looping/one-shot, or respect the Sampler loop flags?

**Depends on**
- MicroTextures DSP: Rust granular + formant filter + WASM binding

**Acceptance criteria**
- MicroTextures settings round-trip in .lampjson.
- Editor tab reachable <=2 presses; preview auditions the rendered texture.
- Exported WAV uses the rendered microtexture clip.

### FEAT-122 — MicroTextures DSP: Rust granular + formant filter + WASM binding
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, microtextures, rust, wasm, formant
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Add `native/prism_dsp/src/microtextures.rs` (grain scheduling, grain size/envelope, density, jitter, reverse probability, pitch/pan scatter, retrigger gating, volume variance, bitcrush/downsample) and a resonant formant filter (F1/F2 vowel presets + resonance, replacing a plain low-pass) either in microtextures.rs or a new filter.rs. Expose `render_microtextures(fusedFlat, channels, sampleRate, params...) -> LoopBufferData` from native/prism-wasm/src/lib.rs, mirroring the percussion binding shape. Rebuild via scripts/build-prism-wasm.mjs (wasm-bindgen is available; wasm32 target installed). Add declarations to src/wasm/vendor/prism/prism_wasm.d.ts and extend PrismWasmModule + makeSpectralRenderer wiring in src/wasm/prism.ts.

**Architecture**
native/prism_dsp/src/microtextures.rs (new), native/prism_dsp/src/lib.rs (pub mod), native/prism-wasm/src/lib.rs (export), native/prism-wasm/pkg -> src/wasm/vendor/prism (build script), src/wasm/prism.ts (optional method + call), src/core/spectral.ts (settings types) or a new src/core/microtextures.ts.

**Key decisions**
- Heavy granular/formant DSP is Rust/WASM (user decision).
- Formant filter is the MicroTextures tone-shaper, replacing low-pass.
- Binding is optional so an older WASM build degrades gracefully (as with percussion).

**Alternatives considered**
- Pure TS granular: rejected by user.
- Reuse existing spectral formant shift only: rejected — it is an envelope shift, not a resonant filter.

**Open questions**
- Grain scheduling determinism: fixed PRNG seed (matching export) vs random per render?

**Acceptance criteria**
- `npm run build:prism-wasm` succeeds and publishes artifacts.
- render_microtextures produces a non-empty loop with audible retrigger gating.
- Formant preset changes spectrum shape; absent WASM falls back without crashing.

### FEAT-119 — Phasing: per-channel start offset + playback speed
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, phasing, audio, session
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Add Channel.phaseOffsetRows (start each channel at a different order/row) and Channel.speed (playback-rate multiplier: half/double-time). Extend the sequence builder to apply the offset when locating a channel's first row and to scale per-channel row advance. Expose both in a Cycles channel editor (an extension of the mixer or a new per-channel page) reachable in <=2 presses. Persist in Project JSON with defaults 0 / 1.

**Architecture**
src/core/songModel.ts (Channel fields), src/core/project.ts, src/core/sampler.ts (sequenceFromSong/Scheduler), src/tui/components/MixerOverlay.tsx or a new Cycles channel page, src/tui/session.ts.

**Key decisions**
- Speed is a channel-level multiplier applied in the sequence/timing layer, not a per-voice transpose.

**Alternatives considered**
- Global tape speed only: rejected — phasing needs per-channel independence.

**Open questions**
- Should speed changes be musical (multiples) or free ratios?

**Depends on**
- Per-channel order lengths: LCM timing, scheduler & sequence wrapping

**Acceptance criteria**
- Two channels with different speeds drift and re-align exactly at the LCM loop point.
- Phase offset survives save/load.
- Offline export matches realtime drift.

### BUG-25 — Hat preset crashed the editor: negative String.repeat in the value bar
- priority: critical
- tags: tui, editor, percussion, crash
- created: 2026-09-18
- updated: 2026-09-18

User crash report: selecting the Percussion "hat" preset crashed the TUI with `RangeError: Invalid count value: -1` at `String.repeat` in ParamEditorOverlay.

Cause: `proportion()` returned an unclamped `(value - min) / (max - min)`. The hat preset's `transientFrequency` is 8500 while the editor's slider max was 8000, so the bar computed `12 - round(ratio*12) === -1` and `"░".repeat(-1)` threw.

Fixes:
- `proportion()` now clamps to 0..1, and the bar's shade count uses `Math.max(0, ...)`.
- Raised the Transient Frequency editor range to 100..12000 so preset values are representable (no silent snapping).

Audited other `.repeat()` bars (MixerOverlay clamps via level; ExplainerPanel already uses Math.max(0, ...)).

Tests: added a ParamEditorOverlay test rendering a number param with value 8500 in a 100..8000 range (previously crashed). 274 tests pass.

### BUG-24 — Percussion Preset didn't cycle and Enter opened text entry, not a list
- priority: medium
- tags: tui, editor, percussion, ux
- created: 2026-09-18
- updated: 2026-09-18

User report: the Percussion "Preset" control did not cycle through the presets, and Enter did not present a list to choose from.

Cause 1: `percussionGroups` built the enum with a hardcoded empty value (`en("Preset", "", ...)`), so it never displayed the current preset and arrow-cycling used `indexOf("") === -1`, effectively bouncing between two entries.
Cause 2: ParamEditorOverlay's Enter on an enum opened free-text value entry rather than a choice list.

Fixes:
- Added `percussionPresetName(settings)` in spectral.ts, which derives which built-in preset the current params match (or `custom` after a tweak). The Preset enum now uses it as its value and includes `custom` in the list, so ←/→ cycles correctly.
- ParamEditorOverlay now opens an enum chooser list on Enter: ↑↓/←→ move, number keys jump, Enter selects, Esc cancels (works for every enum, e.g. Spectral Fusion mode too).

Tests: added `percussionPresetName` derivation test and an enum-chooser test (opens list, down+enter applies the next choice). 273 tests pass.

### BUG-23 — Instrument editor tab bar collapsed/wrapped, hiding the active tab content
- priority: medium
- tags: tui, editor, spectral, chord, hc002
- created: 2026-09-18
- updated: 2026-09-18

User report (Chord follow-up): the Spectral editor's "Enabled" option looked invisible/wrong.

Cause: after adding the Chord tab, the ParamEditorOverlay tab bar exceeded the editor pane width because the 4 tab labels and the long "chain: sampler -> spectral -> percussion (each transforms the previous)" hint shared one row and wrapped/overlapped (e.g. `Spect` over `Sample`). Rendering the bar as a `<Box>` of `<Text>` children also collapsed in the real App's height-constrained column (Yoga shrank it), so the tab row vanished entirely. Additionally the selected row used `backgroundColor="white"` + `color="yellow"` for the value, which is unreadable on light terminals.

Fixes:
- Tab bar is now a single nested `<Text>` (the structure that renders reliably in the App), with the long chain hint removed (the tab labels already convey the chain).
- Selected row uses `inverse` (terminal-agnostic) instead of white background + yellow/black, so the label and its value stay readable on light and dark themes.

Tests: added an editor tab-bar test asserting all four labels render; updated the existing tab test that asserted the removed chain hint. 271 tests pass.

### BUG-22 — Preview louder than pattern; chord octaves truncated by voice cap
- priority: high
- tags: chord, audio, preview, cycles
- created: 2026-09-18
- updated: 2026-09-18

User report (BUG-21 follow-up):
1. Chords were quieter in pattern playback than in the instrument preview.
2. Chord Octaves 3 sounded identical to Octaves 2.

Cause 1: WebAudioBackend.preview passed `settings.volume` (or `settings.volume * voice.gain`) into buildVoice, which applies `settings.volume` again, so the preview was `volume²` while pattern playback was `volume¹` (`previewPattern`/sequence events pass a 0..1 level). The preview also bypasses channel/master gain, compounding the mismatch.
Cause 2: `chordIntervals` slices the octave-expanded list to `voiceCap`; the default cap (8) truncated 3-octave 4-note chords (12 tones) back to the 2-octave set, and the editor never grew the cap.

Fixes:
1. preview now passes `1` (single) or `voice.gain` (chord) to buildVoice, so `settings.volume` is applied exactly once, matching pattern playback.
2. Default `ChordSettings.voiceCap` raised to 12, and the Chord editor's Shape/Octaves setters auto-grow `voiceCap` to `preset-interval-count * octaves` so octave layers are never silently truncated.

Tests: added an assertion that a 3-octave major7 yields 12 intervals under the default cap. 270 tests pass.

### BUG-21 — Chord shape edits were stale; chord voices clipped
- priority: high
- tags: chord, audio, cycles, session
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-121 follow-up):
1. Changing the chord shape (e.g. sus2) still played the old major shape in the pattern.
2. Chord voices clipped (preview and playback).

Cause 1: chord intervals are baked into the sequence as per-voice rates by `sequenceFromSong`, but `Session.updateSamplerSetting` only updated per-instrument settings and never rebuilt the sequence, so the previously expanded chord kept playing.
Cause 2: `chordVoices` gain was `1/sqrt(count)`, so a 3-note chord summed to ~1.73x amplitude and clipped.

Fixes:
1. `updateSamplerSetting` now calls `engine.updateSequence(sequenceFromSong(song, next))` whenever `patch.chord` is present.
2. `chordVoices` gain is now `1/count`, so the chord's levels sum to 1 and cannot clip.

Tests: added a session test asserting the sequence is re-expanded on a chord edit; updated the chord gain test to expect a sum of 1. 270 tests pass.

### BUG-20 — Instrument preview played only the chord root
- priority: medium
- tags: chord, preview, audio, cycles
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-121 follow-up): the instrument-menu preview (ParamEditorOverlay `p`) played only the root note for a Chord instrument, while pattern playback correctly played the whole chord.

Cause: WebAudioBackend.preview built a single voice at PREVIEW_RATE and ignored settings.chord.

Fix: InstrumentPreview now holds a voice array. preview() expands settings.chord via chordVoices() (per-voice rate, gain, pan offset, strum delay) when chord is enabled, releases every voice together for looping previews, and stopPreview/previewPosition/samplePlayheads handle the array. Offline export and row audition already expanded chords, so this was realtime-preview only.

Tests: existing chordVoices/sequence tests cover the expansion; 269 tests pass.

### FEAT-121 — Chord mode: TS voicing expansion, voice groups & realtime/offline parity
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, chord, audio, export
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Expand chord instruments into one note voice per interval at sequence-build time (shared by realtime and offline). Give each expanded event a `voiceGroup` id so an OFF/release on a channel releases the whole chord together. In webSampler.handleEvent schedule one buildVoice per tone (rate = root rate * 2^(interval/12), gain split across voices, strum offsets), and mirror the same expansion/grouping in export.ts renderSamplerMix. Do not let chord voices trigger each other's chord expansion.

**Architecture**
src/core/sampler.ts (SamplerEvent gains voiceGroup; sequenceFromSong expansion), src/audio/webSampler.ts (handleEvent, findLastVoice -> group release), src/audio/backend.ts (PatternNote), src/core/export.ts (RenderVoice grouping), src/tui/session previewPattern.

**Key decisions**
- Expansion lives in sequenceFromSong so all hosts share one truth.
- Off releases the whole group; pitchRamp applies to the group's root voice only unless per-voice slides are added later.

**Alternatives considered**
- Expand in each backend separately: rejected — parity bugs.

**Open questions**
- Should OFF release all tones or only the lowest? Proposal: all.

**Depends on**
- Chord mode: settings model, project serde & editor tab

**Acceptance criteria**
- A single note in the pattern sounds a full chord in realtime and in exported WAV.
- OFF silences the whole chord.
- Polyphony cap honoured across chord groups.

### FEAT-120 — Chord mode: settings model, project serde & editor tab
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, chord, instrument, project
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Add a `ChordSettings` block to SamplerSettings: enabled, chord type preset (major/minor/sus/7th/9th/open/stack), custom interval set (semitones), inversion, octave spread, per-voice detune, strum/roll ms, per-voice pan spread, and max voices. Add a default factory and samplerFromJson/samplerToJson support. Add the Chord tab to editors.tsx after Percussion, extend InstrumentTab and instrumentTabFor precedence (MicroTextures > Chord > Percussion > Spectral > Sampler), and register `overlay:chord` in OVERLAYS + reachability docs + builtins `/chord`.

**Architecture**
src/core/sampler.ts (ChordSettings/default), src/core/project.ts (serde), src/tui/editors.tsx (chordGroups), src/tui/commands/types.ts (OverlayName), src/tui/commands/builtins.ts, src/tui/App.tsx (tab array), tests/unit/reachability.test.ts, docs/REACHABILITY.md.

**Key decisions**
- Chord is a per-note decision expressed in TypeScript (user decision).
- Chain position: after Percussion, before MicroTextures.

**Alternatives considered**
- Baked chord render in prism_dsp: rejected by user — per-note voicing must stay in TS.

**Open questions**
- Interval entry UI: fixed presets only, or custom comma-separated semitone list?

**Acceptance criteria**
- Chord settings round-trip in .lampjson.
- Chord tab reachable within 2 presses and show in instrument tab bar.
- instrumentTabFor returns 'chord' only when chord enabled.

### FEAT-115 — Cycles Mode workspace toggle + Glitch defaults + reachability
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, session, ux, hc002
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

DONE (2026-09-18): Cycles workspace toggle implemented in FEAT-131 (`cyclesMode`, `C` key, `/cycles`), now persisted to the host config (`LanternConfig.cyclesMode`, sanitized; loaded in `Session.init`, serialized writes via `persistConfig`/`flushConfigWrites`). Glitch defaults applied to instruments created while Cycles Mode is on (`glitchSamplerDefaults`: ping-pong loop, long release, pan spread, polyphonic). `docs/REACHABILITY.md` documents `mode:cycles`. Tests: config round-trip/sanitize, session persistence, glitch defaults; test process now isolated to a temp config path.

DEFERRED: the reachability rows for the Chord/MicroTextures instrument tabs will be added with FEAT-120/FEAT-123 (documented under FEAT-127), since those tabs do not exist yet.

### BUG-19 — Cycles view only appeared while playing; instrument colours vanished in it
- priority: high
- tags: cycles, tui, colour, patternview
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-131 follow-up):
1. Cycles Mode should always use the per-channel centred layout, not only while playing.
2. Instrument colour highlighting disappeared while playing in Cycles Mode.

Fixes:
1. PatternView Cycles path is now gated only on `state.cyclesMode`. When playing it centres each channel on its own playhead; when stopped it centres every channel on the edit cursor row at the viewed order, so editing still works. (Removed the now-redundant `pos` header line that had leaked into the normal view.)
2. The Cycles cell renderer now applies the same held-note instrument tint as the normal view (`noteTimeline`/`insTimeline` -> `instrumentTint`), respects `colorInstruments`, and no longer forces `inverse` on the centre line when a tint is present.

Tests: Cycles view stays in layout with `playheads={null}`; existing separator-alignment regression retained. 262 tests pass.

### BUG-18 — Cycles view collapsed channel columns horizontally as rows scrolled
- priority: high
- tags: cycles, tui, phasing, patternview
- created: 2026-09-18
- updated: 2026-09-18

User report (FEAT-131 follow-up): in the Cycles performance view the channels jittered horizontally and appeared to show the wrong part of the pattern.

Cause: out-of-range rows rendered no cell padding, so a channel block collapsed to just its 4-char gutter; the separators and following channels shifted left/right every row, which also made cells look like they were under the wrong header.

Fix: pad blank/out-of-range rows to the channel's fixed cell width (`widths[channel]`), so separators stay in identical columns. Added a regression assertion in tui-components that every Cycles header/body line has separators at the same indices while a short (3-row) channel scrolls with blank rows.

Also verified the per-channel row mapping itself is correct (channelStepAtGlobal -> channelPlayheads -> cellAt at that order/row); the visual mismatch was the collapsed layout, not the engine mapping.

### FEAT-131 — Cycles performance view: per-channel row gutters + centred playhead
- priority: high
- tags: cycles, tui, phasing, playhead, hc002
- created: 2026-09-18
- updated: 2026-09-18

User report: in Cycles/polymeter playback, follow mode doesn't know which channel's playhead to follow. Requested UX: rather than a moving playhead, each channel gets its own row-number gutter next to it, each channel scrolls up independently, and a fixed centre line acts as the playhead across all channels.

Scope:
- Add a minimal `cyclesMode` session flag (toggle via `/cycles on|off` and a key) so the view can be gated. (Persistence + Glitch defaults remain in FEAT-115.)
- PatternView: when `cyclesMode` and playing (`channelPlayheads()` non-null), render a performance view:
  - per channel: [marker][row hex] gutter + cells;
  - each channel scrolls so its own playhead row sits on a fixed centre line;
  - channel's rows come from its own current (order,row) via channelPlayheads; row numbers restart per order;
  - centre line is the playhead.
- When stopped/editing, keep the aligned editor grid so cells line up for editing.
- SongHeader/App pass cyclesMode + playheads.
- Tests: render the performance view and assert per-channel gutter rows differ; toggle command test.

Acceptance: editing with Cycles off is unchanged; with Cycles on during playback each channel visibly scrolls independently around the centred playhead; gates green.

Architecture: src/tui/session.ts, src/tui/commands/builtins.ts, src/tui/App.tsx, src/tui/components/PatternView.tsx, docs/REACHABILITY.md.

### FEAT-130 — True polymeter: independent per-channel row clocks + per-channel playhead
- priority: high
- tags: cycles, timing, scheduler, phasing, tui
- created: 2026-09-18
- updated: 2026-09-18

Follow-up to FEAT-129. Current model: an order lasts the longest pattern and shorter patterns rest. User wants true Polymeter (Oval-style): every channel advances one row per global tick and independently wraps its own cycle = sum of its patterns' rowLengths. Channels drift and only realign at the LCM loop point. Song loop = LCM of channel cycle rows.

Engine:
- layout.ts: channelCycleRows(channel, fallback); channelSteps(channel, fallback) -> flat [{order,row,patternIndex}] of length cycle; songLoopRows(song) = LCM(channelCycleRows).
- buildRowTiming: one tick per global row over songLoopRows; BPM FX scan each channel's own step.
- sequenceFromSong: global row g -> per channel step = steps[c][g % cycle]; timelines indexed [order][row].
- songPositionAt: return global row; add channelStepAt(song, channel, globalRow).
- Scheduler/LoopRange: loop the full LCM; order-loop uses channel 0's order window.

UI:
- session: expose per-channel playhead positions; viewRow follows channel 0 (or cursor channel).
- PatternView: per-channel playhead marker (each channel shows its own current row); keep editing on the view order.
- SongHeader: per-channel position/order indicator.

Acceptance: an 18-row pattern against a 64-row pattern audibly repeats every 18 rows and drifts; visual per-channel playhead shows different rows; existing equal-length projects unchanged; constraint gates green.

Architecture: src/core/layout.ts, src/core/timing.ts, src/core/sampler.ts, src/core/midi.ts, src/tui/session.ts, src/tui/components/PatternView.tsx, SongHeader.tsx.

### FEAT-129 — Per-pattern row length + Pattern settings menu
- priority: high
- tags: cycles, patterns, timing, tui, hc002
- created: 2026-09-18
- updated: 2026-09-18

User request (extends CYCLES MODE). Add a per-pattern `rowLength` (rows in an order) plus a Pattern settings menu opened by Enter on a Pattern in the Pattern Manager.

Semantics (confirmed by user): row count is stored on the pattern number; every order slot referencing that pattern shares it. Order duration = max rowLength across the channels playing at that order. Keep a single global order/row cursor; variable rows change order durations, not channel independence (per-channel order lengths already give phasing).

Scope:
- Model: `Pattern.rowLength`; `.lampjson` serde with default = meta.patternLength.
- Engine: layout helpers (orderRowLength/orderStartRow/totalSongRows/rowToOrder); buildRowTiming, sequenceFromSong, songPositionAt, rowTime, midi use variable order rows; session cursor/selection/loop-range respect the current order's row count; PatternView + SongHeader render variable rows.
- UI: `PatternSettingsOverlay` (Name / Rows / Pattern number) reuse the ParamEditor machinery; OverlayName "pattern" + `/pattern` command; Pattern Manager Enter opens it (z still jumps); docs/REACHABILITY.md + OVERLAYS test.

Acceptance: setting an order to e.g. 8 rows changes its duration; enter on a pattern edits rows/name/number; existing 64-row projects unchanged; all constraint gates green.

Architecture: src/core/songTypes.ts, src/core/songModel.ts, src/core/project.ts, src/core/layout.ts (new), src/core/timing.ts, src/core/sampler.ts, src/core/midi.ts, src/tui/session.ts, src/tui/components/PatternView.tsx, SongHeader.tsx, PatternsOverlay.tsx, src/tui/editors.tsx, src/tui/commands/*, src/tui/App.tsx.

### FEAT-118 — Per-channel order lengths: tracker UI + order editing
- priority: high
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, tui, patterns, hc002
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Show each channel's own order length and permit editing it. SongHeader/OrderStrip indicates wrapped channels; the Patterns and OrderPicker overlays edit per-channel lengths (insert/remove/move) and show the LCM loop extent. Cursor navigation clamps to global meta.orderLength, while the playhead reflects per-channel wrapping. Keep every action within 2 presses.

**Architecture**
src/tui/components/SongHeader.tsx, OrderStrip, PatternsOverlay.tsx, OrderPicker.tsx, src/tui/session.ts structural commands, docs/REACHABILITY.md.

**Key decisions**
- The tracker view stays a global order window; wrapped patterns are shown in place.

**Open questions**
- Should the UI visually mark a channel that has wrapped (e.g. a ↻ glyph)?

**Depends on**
- Per-channel order lengths: model, snapshot & project serialization
- Per-channel order lengths: LCM timing, scheduler & sequence wrapping

**Acceptance criteria**
- Editing one channel's length does not change the others.
- Wrapped channels are visually distinguishable during playback.
- HC002 reachability unchanged.

### FEAT-117 — Per-channel order lengths: LCM timing, scheduler & sequence wrapping
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, timing, scheduler, audio
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Rework the timing/playback core so each channel wraps its own orderList independently and the song loop is the LCM of channel lengths (true phasing). Build the global row clock over LCM(len) * patternLength rows; map global order o to channel pattern via orderList[o % channelLen]. sequenceFromSong must emit rows over the LCM and select per-channel cells with that wrap. Scheduler/loopRange/songPositionAt/midi.ts and Session.syncLoopRange all learn the LCM-derived total. Decide how 09xx/0Axx BPM effects resolve when channels are on different orders (open question).

**Architecture**
src/core/timing.ts (buildRowTiming, songPositionAt), src/core/sampler.ts (sequenceFromSong, Scheduler, LoopRange), src/core/midi.ts, src/core/songModel.ts timelines (insTimeline/noteTimeline currently indexed by global order), src/tui/session.ts (syncLoopRange, cursor totals).

**Key decisions**
- Independent cycling, song loop = LCM — chosen by user.
- Global meta.orderLength stays the cursor/UI span (max length).

**Alternatives considered**
- Global order governs, shorter channels rest: rejected by user.
- Order-loop only: rejected by user.

**Open questions**
- How should BPM-change FX (09/0A) apply when channels are on different wrapped orders in the same global row? Proposal: apply every active cell's FX in channel order at the global row, as today.
- Should per-channel ordering be forward-only or support per-channel direction?

**Depends on**
- Per-channel order lengths: model, snapshot & project serialization

**Acceptance criteria**
- LCM loop test: lengths [2,3] produce a 6-order loop with correct per-channel patterns.
- Playback, seek, loop-range and MIDI export agree on the LCM duration.
- No stale-sequence bug (cf. BUG-17) on structural edits.

### FEAT-116 — Per-channel order lengths: model, snapshot & project serialization
- priority: critical
- tags: plan-cycles-mode-glitch-ambient-workspace, cycles, songModel, project, patterns
- created: 2026-09-18
- updated: 2026-09-18
- plan: cycles-mode-glitch-ambient-workspace
- kind: card
- parent: FEAT-114

**Plan:** CYCLES MODE — Glitch Ambient workspace _(#plan-cycles-mode-glitch-ambient-workspace)_

**Plan summary**
Add a "Cycles" workspace geared to Oval "Do While"-style Glitch Ambient. Foundation is per-channel order lengths with independent channel cycling (song loop = LCM). On top: Chord and MicroTextures instrument modes, a Formant filter replacing low-pass tone shaping, plus a full phasing / glitch-event / tone-space feature set the user approved ("Everything"). Architecture split agreed with the user: TypeScript owns per-note decisions (chord intervals, voicing, trigger scheduling), Rust/WASM prism_dsp owns the fast DSP (granular microtexture render, formant filter, bitcrush). All features must stay reachable within 2 presses (HC002), ship on desktop + web (HC003), add no unvetted deps (HC004), and keep .lampjson backward compatible.

**Approach**
Make each channel's order length explicit instead of deriving everything from one global meta.orderLength. Add per-channel `orderLength` to the PatternSnapshot channel entry (defaulting to orderList.length) and keep `meta.orderLength` as the maximum for display/cursor. Serialize per-channel lengths in snapshotToSerde/snapshotFromSerde with backward-compat: absent => orderList.length. Update tracker.ts structural ops (insert/remove/move/setOrderPattern/clear) to operate per channel and recompute the max.

**Architecture**
src/core/songModel.ts (Channel.orderLength, patternSnapshot/applySnapshot), src/core/project.ts (snapshot serde), src/core/tracker.ts (order ops), src/core/songTypes.ts if needed.

**Key decisions**
- Channel.orderList.length is the source of truth; orderLength is an explicit mirror for O(1) reads.

**Alternatives considered**
- Derive length only from orderList.length with no field: rejected — snapshot round-trips and UI reads get awkward.

**Acceptance criteria**
- Round-trip test: a project with channel lengths [3,5,2,1] reloads identically.
- Legacy projects without per-channel length load with orderList.length.
- Insert/remove/duplicate update only the target channel; global max recomputed.

### BUG-17 — Structural order edits left the audio sequence stale (wrong pattern played)
- priority: high
- tags: audio, scheduler, orders, patterns, session
- created: 2026-09-18
- updated: 2026-09-18

After deleting a pattern and switching loop from order back to whole-song, playback still scheduled the pre-edit orders even though the visual tracker had looped to the right pattern.

Root cause: `insertPatternAt`, `removePatternAt`, `moveOrder`, `setOrderPatternNumber` and `clearAllPatterns` all mutate the song via `applySnapshot` but never called `engine.updateSequence(sequenceFromSong(song))`. The `WebAudioBackend`/`Scheduler` kept its cached `Sequence`, so the visuals (read live from `song`) and the audio diverged.

Fix: new `Session.syncAfterSnapshot()` re-publishes the sequence, refreshes `duration` from `engine.songDuration()` and re-applies the loop range; called from all five structural ops. Regression test extends `tui-tracker-ops` to assert `backend.songDuration()` tracks the edited song after insert/remove.

### FEAT-66 — Furnace/.fur removal, autosave + /restore, startup auto-open
- updated: 2026-09-18

- priority: high
- tags: plan-furnace-fur-removal-autosave-restore-startup-auto-open, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: epic

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Cards**

- FEAT-67 — Furnace removal 1/3 — relocate shared song types to a neutral core module
- FEAT-68 — Furnace removal 2/3 — delete the parser, RawFurModule, fixtures and parser tests
- FEAT-69 — Furnace removal 3/3 — strip .fur from IO, commands, session state and UI text
- FEAT-70 — Runtime config file under ~/.config/lantern/config.json
- FEAT-71 — Autosave backup.lmpjson every 15 actions + /restore
- FEAT-72 — Startup auto-open of last project + /default-open-override

### FEAT-17 — Terminal Lantern — TUI migration
- updated: 2026-09-18

- priority: critical
- tags: plan-terminal-lantern-tui-migration, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: epic

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

Scriptability constraint (design-only, build deferred to FEAT-32): the command registry is the single source of action so that a future `.lmpscript` runner or an agent control channel can drive the exact same commands the TUI uses, with structured (machine-readable) results and no Ink coupling. See FEAT-22.

**Cards**

- FEAT-18 — De-Electron-ify: shared Node asset loader + file IO layer
- FEAT-19 — Audio: node-web-audio-api backend shim
- FEAT-20 — WASM + worker host: run prism DSP under Node worker_threads
- FEAT-21 — TUI shell: persistent tracker + song info layout
- FEAT-22 — Slash-command engine: registry, fuzzy match, suggestions, Tab completion
- FEAT-23 — Commands: tracker navigation and editing
- FEAT-24 — Commands: transport, playback and song info
- FEAT-25 — Commands: mixer, master FX and channel settings overlay
- FEAT-26 — Commands: file, project and export IO with path completion
- FEAT-27 — Commands: source samples and sampler browse + preview
- FEAT-28 — Packaging: single `lantern` bin, build pipeline, drop Electron/Vite
- FEAT-29 — Test strategy: port core tests, add headless TUI + audio regression
- FEAT-30 — Retire Electron + React DOM (cleanup)
- FEAT-31 — Deferred parity: graph editors (sampler, spectral/percussion, master FX graphs, cover art)
- FEAT-32 — Deferred: scripting & live control channel (`.lmpscript`, agent automation)

**Status (2026-09-17) — TUI migration plan complete**
`npm run dev:tui` builds and runs the terminal app. All cards on this plan are Implemented: FEAT-18 Node runtime/IO, FEAT-19 node-web-audio-api shim, FEAT-20 prism worker thread, FEAT-21 Ink shell (persistent tracker + song info), FEAT-22 slash-command engine (fuzzy + Tab), FEAT-23 tracker editing (selection/clipboard/transpose/order ops), FEAT-24 transport, FEAT-25 mixer overlay, FEAT-26 open/new/export, FEAT-27 sample browser + waveform, FEAT-28 packaging, FEAT-29 tests, FEAT-30 Electron/React-DOM removal, FEAT-31 sampler/spectral/percussion/master-FX editors + headless cover art, FEAT-32 live control socket + `.lmpscript` runner. Verified by 23 test files / 144 tests, a real control-socket E2E (`examples/control-smoke.lmpscript`) and an interactive pty smoke. Remaining possible future work: FEAT-15 (mecha/power-suit cover _designer_, archived) and deeper modulation-route authoring in the TUI.

### FEAT-78 — BPM + highlight timing, editable /info
- updated: 2026-09-18

- priority: critical
- tags: plan-bpm-highlight-timing-editable-info, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: epic

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Cards**

- FEAT-79 — Core timing model: BPM + beat/bar highlights
- FEAT-85 — Redefine timing FX as two BPM up/down effects
- FEAT-81 — Remove the legacy model surface
- FEAT-82 — Editable Song Info menu + /info opens it
- FEAT-83 — Stepthrough timing chapter uses BPM/highlights
- FEAT-84 — Final legacy scrub + docs/overview update
- FEAT-80 — Remove timing FX from the tracker catalog (archived — superseded by FEAT-85)

### FEAT-84 — Final legacy scrub + docs/overview update
- updated: 2026-09-18

- priority: low
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, docs, cleanup, kanban
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Sweep any stragglers after the code changes and update documentation so future agents see a legacy-free project.

**Architecture**
KANBAN.md: rewrite the three legacy chip mentions (project overview line 10, the FEAT-73 description, and the FEAT-67 architecture note) to '4-channel tracker' / neutral wording; confirm the timing section of the overview now says BPM + beat/bar highlighting. Check assets/ and comments for stragglers. Record the new timing model and the /info menu in the Project overview.

**Key decisions**

- Scrub all live KANBAN.md mentions (including historical cards' wording) since the user asked to remove all references.

**Alternatives considered**

- Leave historical Implemented card text untouched (rejected: user asked for all references removed).

**Depends on**

- Remove the legacy model surface
- Editable Song Info menu + /info opens it

**Acceptance criteria**

- rg -i 'game ?boy|legacy' over the repo (excl. node_modules/dist/.git) returns nothing.
- Project overview documents BPM + highlights and the /info menu.

### FEAT-83 — Stepthrough timing chapter uses BPM/highlights
- updated: 2026-09-18

- priority: medium
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, stepthrough, tutorial
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Retarget the generated timing step from tickRate/speed to bpm/highlightA/highlightB so the tutorial rebuilds the same project under the new model.

**Architecture**
src/core/stepthrough.ts: StepAction 'timing' kind swaps tickRate/speed for bpm; generator reads project.bpmOverride/highlightAOverride/highlightBOverride; applyBuildStep writes target.project.bpmOverride and target.song.meta.bpm and re-times (retime). SongInfoPanel highlight labels become 'Timing'/'BPM'/'Beat'/'Bar' as appropriate. blankTarget clears the new overrides.

**Key decisions**

- One timing step covering bpm + both highlights (as today).

**Alternatives considered**

- Emit separate BPM and highlight steps (rejected: more noise).

**Depends on**

- Core timing model: BPM + beat/bar highlights
- Editable Song Info menu + /info opens it

**Acceptance criteria**

- Generated recipe includes a BPM/timing step; applying it reproduces the project's row timing.
- stepthrough tests updated and green.

### FEAT-82 — Editable Song Info menu + /info opens it
- updated: 2026-09-18

- priority: high
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, tui, menu, commands
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Make /info open the existing 'song' overlay as an editable menu. Reuse ParamEditorOverlay (already supports text/number/enum with enter-to-type, scrolling and the explainer) by adding songInfoGroups(session). The stepthrough Song chapter keeps the read-only SongInfoPanel.

**Architecture**
src/tui/editors.tsx: export songInfoGroups(session): EditorGroup[] with groups Song (Title, Artist, Album, Comments), Credits (Music license, Code license, Source link, Website link), Timing (BPM, Beat highlight rows, Bar highlight rows). src/tui/session.ts: setSongMeta(field, value), setBpm(bpm), setHighlight(a, b) - patch song.meta + project, retime(song), engine.updateSequence(sequenceFromSong(song)), refresh duration, markAction. src/tui/App.tsx: activeOverlay === 'song' renders ParamEditorOverlay when !stepMode (title 'Song Info', onPreview undefined, height viewportRows), otherwise the existing SongInfoPanel for stepthrough. src/tui/commands/builtins.ts: /info calls ctx.openOverlay?.('song') and still returns the structured data (name/bpm/patternLength/...). Update menuContext hints and HelpOverlay.

**Key decisions**

- Reuse ParamEditorOverlay rather than write a bespoke overlay (less code, consistent keyboard model).
- BPM/beat/bar live in the Timing group of the same menu, per the request.
- Editing BPM/highlights re-times the song immediately (rowTimes + engine sequence) and marks the project dirty/autosaveable.

**Alternatives considered**

- Make SongInfoPanel itself interactive (rejected: duplicates ParamEditorOverlay).
- Separate /timing command/menu (rejected: user wants timing inside /info).

**Open questions**

- Should Bar highlight auto-clamp to a multiple of Beat highlight, or allow any value?

**Depends on**

- Core timing model: BPM + beat/bar highlights
- Remove the legacy model surface

**Acceptance criteria**

- /info opens a menu listing Title/Artist/Album/Comments/licences/links and BPM/Beat/Bar; edits persist through Ctrl+S/autosave.
- Changing BPM updates the SongHeader tempo, row timing, playhead and MIDI/export timing.
- Stepthrough still renders the read-only SongInfoPanel with highlights.
- typecheck + tests green (add a session test for the new setters and a component test for the menu).

### FEAT-81 — Remove the legacy model surface
- updated: 2026-09-18

- priority: high
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, core, cleanup
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Delete every remaining legacy chip type/field/string now that the model is a standalone sampler tracker.

**Architecture**
src/core/songTypes.ts: remove NoteValue, EffectSlot, PatternCell, Pattern (and any now-unused exports). src/core/songModel.ts: InstrumentInfo drops insType/legacy params; SongModel drops wavetables/chips. src/tui/session.ts addInstrument and snapshot(): drop insType/legacy params/system/tickRate. src/tui/explainer.ts: replace the legacy chip channel roles (Pulse/Wave/Noise) with generic per-channel descriptions, and delete the legacy branch in instrumentDescription/instrumentExplain. src/tui/components/SongHeader.tsx already stops printing system via the timing card. src/tui/commands/builtins.ts /info drops system. Remove ChipDef/chips from any export/cover path (none currently use them).

**Key decisions**

- InstrumentInfo keeps only name + colorRgb (plus whatever playback needs).
- Keep NoteValue's macroRelease/rawFreq for now (they are note-event kinds, not legacy chip UI), but scrub their explainer text.

**Alternatives considered**

- Also remove the macroRelease/rawFreq note kinds (rejected for this pass: broad player/format churn; can be a follow-up).

**Depends on**

- Core timing model: BPM + beat/bar highlights

**Acceptance criteria**

- rg -i 'game ?boy|legacy|chipId|insType|wavetable|GAME_BOY' over src tests returns nothing.
- typecheck + full test suite green.

### FEAT-85 — Redefine timing FX as two BPM up/down effects
- updated: 2026-09-18

- priority: high
- tags: tracker, effects, timing, bpm, plan-bpm-highlight-timing-editable-info
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

Keep the timing FX (do NOT remove them), but disconnect them from the old legacy chip timing system and reduce the whole timing-effect family to exactly two BPM-based effects:

- 09 xx — Tempo up: increase the current BPM by xx.
- 0A xx — Tempo down: decrease the current BPM by xx.

(Exact codes to confirm; suggested 09 up / 0A down. This replaces 09 Set Speed 1, 0F Set Speed 2, F0/C0-C3 tick-rate and FD/FE virtual-tempo.)

Semantics: the effect value is a BPM delta, applied on its own row, relative to the running BPM (base meta.bpm plus any prior adjustments). Clamp the running BPM to a sane minimum (e.g. 20) and maximum. Row duration for that row and onward uses the adjusted BPM: rowDur = 60 / (bpm * highlightA).

Files: src/core/tracker.ts FX_CATALOG (list only 01/02 pitch slides + these two timing entries, with labels like "09xx Tempo up" / "0Axx Tempo down"); src/core/timing.ts buildRowTiming (interpret only the two codes; drop F0/C0-C3/09/0F/FD/FE handling); src/tui/explainer.ts cellExplain wording; stepthrough/tracker tests. FEAT-79 (core timing) must keep buildRowTiming applying these two effects.

This card replaces the now-archived FEAT-80 ("Remove timing FX"). Part of epic FEAT-78 / plan game-boy-removal-bpm-highlight-timing-editable-info.

### FEAT-79 — Core timing model: BPM + beat/bar highlights
- updated: 2026-09-18

- priority: critical
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, core
- created: 2026-09-17
- updated: 2026-09-18
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Collapse the timing model to one tempo (bpm) plus row highlighting. Row duration = 60 / (bpm * beatRows), where beatRows = meta.highlightA (rows per beat) and barRows = meta.highlightB (rows per bar). Delete tickRate, speedPattern and virtualTempo from the timing path. Keep only the two BPM up/down timing FX (FEAT-85) and a constant TICKS_PER_ROW so the 01/02 pitch-slide maths is unchanged.

**Architecture**
src/core/songModel.ts: SongMeta drops system/formatVersion/tickRate/speedPattern/virtualTempo and gains bpm; ProjectSongSource drops tickRateOverride/speedOverride/virtualTempoOverride and gains bpmOverride; buildSongModelFromProject reads bpmOverride (default 150 or 120) and highlight overrides, then buildRowTiming. src/core/timing.ts: rowDurationSec(meta) = 60/(bpm*max(highlightA,1)); buildRowTiming walks rows applying the two BPM up/down FX (FEAT-85) to a running bpm and returns starts from rowDur = 60/(bpm*highlightA) and ticks[i]=TICKS_PER_ROW (export const TICKS_PER_ROW = 6). src/core/project.ts: ProjectFile/defaultProject/projectFromValue/projectToValue swap the three override fields for bpmOverride; projectFromValue migrates legacy projects by computing bpm = 60*tickRate/(speed*highlightA) when bpmOverride is absent. src/tui/explainer.ts rowExplain and src/tui/components/SongHeader.tsx print BPM/beat/bar instead of Hz/speed. src/tui/session.ts snapshot() reports bpm. src/tui/commands/builtins.ts /info data reports bpm.

**Key decisions**

- Keep the *Override field naming for consistency (add bpmOverride, keep highlightAOverride/highlightBOverride).
- Migration formula bpm = 60 * tickRate / (speed * highlightA), clamped to a sane range (20-999).
- Keep TICKS_PER_ROW = 6 so pitch slides sound the same.
- patternLength/orderLength/tuningA4 are not tempo and stay.

**Alternatives considered**

- Store a plain bpm field and drop the *Override names (rejected: more format churn).
- Redefine 01/02 slides as per-row instead of per-tick (rejected: changes existing slide amounts).
- Keep virtual tempo as a hidden multiplier (rejected: user wants only BPM).

**Open questions**

- Pick the new default BPM for defaultProject()/no-override songs (suggest 150 to match today's 60Hz/speed6/beat4, or 120 for a rounder default).

**Acceptance criteria**

- No live core code reads tickRate/speedPattern/virtualTempo except the legacy migration; rg confirms.
- The two BPM up/down FX adjust row timing (unit-tested).
- rowDurationSec/bpm maths covered by unit tests; the bundled asset migrates and plays at the same speed as before.
- MIDI export tests still pass (tempo comes from rowTimes).
- typecheck + full test suite green.

### FEAT-100 — Constraint compliance: static web TUI (HC003) + constraint hardening
- priority: critical
- tags: plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, epic
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: epic

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Cards**
- FEAT-101 — Host abstraction layer: inject runtime IO (Node + browser)
- FEAT-102 — Browser AssetHost: fetch bundled project + SourceSamples
- FEAT-103 — Browser persistence + project/export IO
- FEAT-104 — Browser audio + Prism WASM host
- FEAT-105 — Browser Ink terminal host (xterm.js bridge)
- FEAT-106 — Web shell/frame with non-TUI buttons
- FEAT-107 — Web build pipeline (Vite) + scripts + docs
- FEAT-108 — Web E2E tests + cross-platform CI matrix
- FEAT-109 — Make CONSTRAINTS.md machine-checkable + generate tests
- FEAT-110 — HC002 two-press reachability audit + fixes
- FEAT-111 — Cross-platform desktop verification (win/mac/linux)
- FEAT-112 — Dependency provenance refresh for new web deps
- FEAT-113 — Remove stale Electron/desktop build artifacts + dead externals

### FEAT-112 — Dependency provenance refresh for new web deps
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, hc004, security, deps
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
After the web cards lock the dependency set (xterm.js/@xterm/headless, vite, @playwright/test, possibly a deflate helper), run security_package_validate on each and add it to scripts/audit-dependencies.mjs ALLOWED with the expected upstream repository pattern. Remove stale allowlist entries for packages no longer used (electron, react-dom, @types/react-dom, jsdom, @vitejs/plugin-react if unused). Keep the minimum-age and weekly-download thresholds, and verify every transitive lock entry still has a registry.npmjs.org URL and sha512 integrity.

**Architecture**
scripts/audit-dependencies.mjs ALLOWED map + ALIASES; package.json. Wire the refreshed script into the CONSTRAINTS.md HC004 check (see the machine-check card).

**Key decisions**
- Only add packages that pass validation with a clear upstream repository.
- Treat any high/critical finding as a blocker before adding the dependency.

**Alternatives considered**
- Vendor a deflate implementation to avoid a new dependency — acceptable alternative to evaluate during this card.

**Depends on**
- Browser Ink terminal host (xterm.js bridge)
- Web build pipeline (Vite) + scripts + docs

**Acceptance criteria**
- npm run audit:deps passes for the final dependency set.
- No stale/removed package remains in the allowlist.
- security_package_validate reports no high/critical findings for the new packages.
- The refresh is recorded before any web dependency is committed.

### FEAT-111 — Cross-platform desktop verification (win/mac/linux)
- priority: medium
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, desktop, ci
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Audit OS-specific behaviour of the Node desktop app: config dir should use %APPDATA% (or LOCALAPPDATA) on win32 instead of ~/.config; confirm the Windows named-pipe control path and Unix socket cleanup; confirm node-web-audio-api prebuilt binaries install on all three OSes; check Ink rendering in Windows Terminal, macOS Terminal and a typical Linux terminal. Fix the config-path issue. The CI matrix card already adds the automation hook.

**Architecture**
src/runtime/config.ts (win32 branch), src/control/paths.ts, package.json engines/optionalDependencies. Document findings in docs/PLATFORMS.md.

**Key decisions**
- Honour platform conventions for user state instead of always using XDG paths.
- Keep the desktop app a normal terminal binary (bin: lantern), not a packaged GUI.

**Alternatives considered**
- Package as a triple-click desktop bundle (Electron/Tauri) — rejected: HC001 wants a TUI, and the terminal binary is the desktop app.

**Depends on**
- Web E2E tests + cross-platform CI matrix

**Acceptance criteria**
- configDir resolves correctly on win32/macOS/Linux and has unit tests for each.
- npm install + build:tui + start:tui are documented and verified per OS (CI where possible).
- No Unix-only assumption remains in the control or config paths.

### FEAT-110 — HC002 two-press reachability audit + fixes
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, hc002, ux, tui
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Define the metric precisely: from the main tracker screen, every menu/overlay opens in <=2 key presses, and every parameter inside a menu is reachable in <=2 presses from that menu's entry point. Enumerate the 73 registered commands, the context-action menus, and every ParamEditorOverlay group into docs/REACHABILITY.md with the exact key path. Add a vitest test that walks the registry/overlay metadata and fails on any entry with no documented <=2-press path. Fix the gaps found (for example parameters buried behind multiple tab cycles, or menus with no direct hotkey).

**Architecture**
docs/REACHABILITY.md + tests/unit/reachability.test.ts driving src/tui/commands/registry.ts, src/tui/contextActions.ts and the editor group metadata in src/tui/editors.tsx. Coordinate with FEAT-82 (editable /info) which changes the song menu.

**Key decisions**
- Measure from the main screen, counting a key that opens a menu as press 1 and a key that selects/activates within it as press 2.
- Prefer adding a direct hotkey/context action over restructuring menus.

**Alternatives considered**
- Interpret 'button press' loosely as 'a typed slash command' — rejected: that would make the constraint untestable and miss hidden parameters.

**Acceptance criteria**
- docs/REACHABILITY.md lists every menu and parameter with its <=2-press path.
- tests/unit/reachability.test.ts enforces the documented paths and fails on regressions.
- Any gap found is fixed or explicitly recorded with a follow-up.

**Comments**
- Independent of the web work; can run in parallel. Watch for overlap with the pending BPM cards (FEAT-82).

### FEAT-109 — Make CONSTRAINTS.md machine-checkable + generate tests
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, process, hc002, hc004, sc001
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Add machine directives so constraints_validate actually enforces the rules. HC003: 'Must exist: src/web/main.tsx' and 'Run: npm run build:web'. HC004: 'Run: npm run audit:deps -- --offline'. SC001: 'Must not exist: src/**/*.js' and 'Must exist: tsconfig.json'. HC001 and HC002 stay manual, but add hand-written assertions in constraints-tests/checks/ (HC001: src/tui exists and App is rendered by Ink; HC002: a reachability test over the registry/overlays). Then run constraints_generate_tests and constraints_run_tests.

**Architecture**
CONSTRAINTS.md machine blocks; generated constraints-tests/generated/**; hand-written constraints-tests/checks/**.

**Key decisions**
- Machine-check what is objectively checkable; keep the two judgement calls as documented manual checks with a real test where possible.
- Re-run constraints_generate_tests after any CONSTRAINTS.md edit (required workflow).

**Alternatives considered**
- Leave all rules manual — rejected: that is the gap this plan exists to close.

**Depends on**
- Web build pipeline (Vite) + scripts + docs

**Acceptance criteria**
- constraints_validate passes with the new directives (after the web target exists).
- constraints_run_tests reports real assertions for HC003/HC004/SC001 and no unexplained skips.
- HC002 has a passing machine test (or an explicit, justified manual-review entry).

### FEAT-108 — Web E2E tests + cross-platform CI matrix
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, testing, ci
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Add playwright.web.config.ts (channel chrome, baseURL http://127.0.0.1:8123, webServer python3 -m http.server --directory dist/web) and tests/web specs: smoke (frame + terminal render), command (/info + type in the pattern), io (save/open round-trip via download/upload), audio-gesture (AudioContext resumes after click), and a no-console-errors assertion. Add a GitHub Actions workflow matrix (ubuntu/macos/windows) running typecheck, vitest, lint and the headless web smoke test.

**Architecture**
playwright.web.config.ts, tests/web/*.spec.ts, .github/workflows/ci.yml. Reuse the 0008 web config shape.

**Key decisions**
- Playwright over the existing Chrome install, as in 0008.
- Web tests run against the built dist/web, not the dev server, so they exercise the shipped bundle.

**Alternatives considered**
- Skip web E2E and rely on unit tests — rejected: the terminal bridge and audio-gesture behaviour only exist in a real browser.

**Depends on**
- Web build pipeline (Vite) + scripts + docs

**Acceptance criteria**
- Web E2E passes headless Chrome locally and in CI.
- CI matrix runs on all three desktop OSes.
- Any page error or uncaught console error fails the web smoke test.

**Comments**
- This card also covers the cross-platform desktop CI portion of HC003 for the core app.

### FEAT-107 — Web build pipeline (Vite) + scripts + docs
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, build
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Add vite.config.web.mts (root src/web, base './', alias '@'->src, target chrome120, outDir dist/web) mirroring the 0008 sibling, plus scripts build:web and serve:web. Copy assets/ into dist/web/assets (skipping the large mix WAV as 0008 did). Add a build guard that fails if any node: builtin is reachable from the browser graph. Add build:web to test:all and document build/serve/test:web in the KANBAN project overview and README.

**Architecture**
vite.config.web.mts, package.json scripts, scripts/build-web.mjs. Reuse the existing audit:deps script in test:all.

**Key decisions**
- Vite for the web target (already a devDependency and proven in 0008).
- Output is fully static — servable by any static host.

**Alternatives considered**
- esbuild-only web build — rejected: would need hand-rolled HTML/CSS/asset handling that Vite already provides.

**Depends on**
- Browser Ink terminal host (xterm.js bridge)
- Web shell/frame with non-TUI buttons

**Acceptance criteria**
- npm run build:web produces dist/web that runs from a static server.
- A node: import in the browser graph fails the build with a clear error.
- KANBAN overview + README describe the desktop and web targets.

### FEAT-106 — Web shell/frame with non-TUI buttons
- priority: medium
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, ui, hc001
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Build the page around the terminal: src/web/index.html + main.tsx + styles.css. A terminal frame (retro/CRT styling, monospace) hosts the xterm.js canvas, with extra NON-TUI HTML buttons: play/stop, save, open, restore backup, help, fullscreen, and mute/volume, plus status readouts (BPM, play position, dirty flag) read from SessionState. Buttons dispatch through the same command registry/session action surface as typed commands.

**Architecture**
src/web/{index.html,main.tsx,styles.css,shell.tsx?}. Subscribe to session state for the status strip; call registry commands for actions. Ensure focus returns to the terminal after a button click.

**Key decisions**
- Buttons are a thin shell over the command registry — no duplicated business logic.
- The TUI remains fully usable with zero buttons (HC001/HC002).

**Alternatives considered**
- Only a bare terminal with no buttons — rejected by the HC001/003 wording that the web version has extra non-TUI buttons.

**Depends on**
- Browser Ink terminal host (xterm.js bridge)

**Acceptance criteria**
- Each button performs its action and the terminal reflects it.
- Frame is responsive from a narrow phone width up to desktop.
- Keyboard focus returns to the terminal after clicking a button.

### FEAT-105 — Browser Ink terminal host (xterm.js bridge)
- priority: critical
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, tui, ink, xterm
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
SPIKE first: prove Ink 7 render() accepts a shimmed stdout (write, columns, rows, on('resize'), isTTY) and stdin (EventEmitter with on('data') and setRawMode) by rendering a tiny component to an in-memory buffer in a Node test. Then implement src/web/terminalHost.ts: create an xterm.js Terminal, expose a Writable-shaped stdout whose write forwards to term.write, a Readable-shaped stdin fed by term.onData, and a ResizeObserver/term.onResize handler that updates columns/rows and emits 'resize'. Render the existing App with { stdout, stdin, exitOnCtrlC:false }.

**Architecture**
src/web/terminalHost.ts plus a small ink-stream-shim. Keep ONE App/tree; the browser is just another terminal backend. If the spike fails, fall back to @xterm/headless rendering + mirroring into xterm.js (documented in the card).

**Key decisions**
- Reuse the exact Ink App and command registry — no UI fork.
- xterm.js is the terminal renderer; the extra buttons live outside it (see web frame card).

**Alternatives considered**
- Reimplement components with react-dom — rejected: violates HC001 and forks the codebase.
- Server-side Ink streamed over WebSocket to xterm.js — rejected by the user in favour of a static client-side build.

**Depends on**
- Host abstraction layer: inject runtime IO (Node + browser)
- Browser AssetHost: fetch bundled project + SourceSamples
- Browser audio + Prism WASM host

**Acceptance criteria**
- The full app renders in Chrome, arrow/Tab/Enter/Escape/Ctrl-key navigation matches the terminal.
- Resizing the window reflows the pattern view with no clipping.
- Quit/Ctrl+C behaviour and the command bar work in the browser.
- Spike decision (shim vs @xterm/headless) is recorded in the card before implementation.

### FEAT-104 — Browser audio + Prism WASM host
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, audio, wasm
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Split the audio bootstrap by host: host/node installs node-web-audio-api globals (today's src/runtime/audio.ts); host/browser is a no-op because the browser already provides the Web Audio globals. Guarantee node-web-audio-api is excluded from the browser module graph. For the Prism DSP, fetch prism_wasm_bg.wasm and initSync/registerPrismWasm, preferring the existing Web Worker path (src/wasm/prism.worker.ts + PrismWorkerClient.realWorker). Resume AudioContext on the first user gesture. Do not start ControlServer in the browser.

**Architecture**
src/host/browser/audio.ts and src/host/browser/prism.ts. Reuse src/wasm/prism.ts registration helpers and prismWorkerClient.ts unchanged. src/wasm/prismNode.ts and prism.worker.node.ts stay Node-only.

**Key decisions**
- One audio/Prism registration API; only the bootstrap differs per host.
- Spectral rendering degrades to plain samples if WASM fails, matching Node.

**Alternatives considered**
- AudioWorklet instead of the worker for Prism — rejected for this pass: the worker protocol is already tested and shared.

**Depends on**
- Host abstraction layer: inject runtime IO (Node + browser)

**Acceptance criteria**
- Audio plays in Chrome only after a user gesture (autoplay policy).
- Spectral instruments render through the Web Worker in the browser.
- No 'module not found: node-web-audio-api' or node: builtin errors appear in the browser console.

### FEAT-103 — Browser persistence + project/export IO
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, persistence, io
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Implement the browser ConfigStore + AutosaveStore over IndexedDB (config: lastProject, defaultOpen, recentProjects; autosave: backup.lmpjson). Implement browser project open/save with the File System Access API when showOpenFilePicker/showSaveFilePicker exist, falling back to <input type=file> plus an anchor download. Distinguish 'save' (write back to a granted handle) from 'save as'. Exports (wav, mid, zip, png) become Blob downloads. Path completion is replaced by the recent-projects list plus upload.

**Architecture**
src/host/browser/{config.ts,autosave.ts,files.ts}. Reuse existing Node config sanitisation logic. Replace node:zlib deflateSync in src/runtime/cover.ts with CompressionStream('deflate') and a pure-JS fallback so PNG export works in the browser; expose deflate through the host.

**Key decisions**
- IndexedDB over localStorage (backup files can exceed the 5MB localStorage quota).
- Keep the same .lampjson format; the web is just a different transport.
- No path-completion in the browser; recent list + upload/drag-drop instead.

**Alternatives considered**
- Vendor fflate for deflate — deferred; prefer the built-in CompressionStream with a minimal fallback (would need HC004 review if vendored).

**Depends on**
- Host abstraction layer: inject runtime IO (Node + browser)

**Acceptance criteria**
- Open a .lampjson edit and save/reopen round-trips in the browser (both FS Access API and the fallback path).
- Autosave backup survives a page reload and /restore reloads it.
- WAV/MIDI/ZIP/PNG exports download and the PNG decodes correctly.
- Recent projects list persists in config.

### FEAT-102 — Browser AssetHost: fetch bundled project + SourceSamples
- priority: high
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, assets
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Implement the browser AssetHost on top of the HostServices seam. Resolve assets relative to import.meta.env.BASE_URL (Vite), fetch assets/lmp-default-proj.lampjson and SourceSamples/{0..5}.ogg, and return the same shapes as src/runtime/assets.ts (readAsset, readAssetText, listSourceSamples, loadDefaultSong) so Session/io code is unchanged.

**Architecture**
src/host/browser/assets.ts. Keep the existing SourceSampleAsset shape { index, path, present, bytes }. The web build copies the assets/ tree into dist/web/assets (see the web build pipeline card).

**Key decisions**
- Fetch-based loading in the browser; Node keeps fs.
- A missing sample yields present:false rather than throwing, matching Node behaviour.

**Alternatives considered**
- Stream samples lazily per request — rejected for now: the samples are small and the current load path expects all six up front.

**Depends on**
- Host abstraction layer: inject runtime IO (Node + browser)

**Acceptance criteria**
- In a browser, the bundled default project loads and all six source samples resolve (present:true) with no fs access.
- A unit test with a stubbed fetch covers readAssetText/readBytes and the missing-file case.

### FEAT-101 — Host abstraction layer: inject runtime IO (Node + browser)
- priority: critical
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, refactor
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Introduce one HostServices seam so the TUI never imports node: directly. Define interfaces in src/host/types.ts for file read/write, asset loading, config store, autosave store, PNG deflate and audio bootstrap. Provide src/host/node/* wrapping today's src/runtime/files.ts, src/runtime/assets.ts, src/runtime/config.ts, src/tui/autosave.ts and src/runtime/audio.ts. Provide src/host/browser/* (filled by later cards). Session takes a host (default = Node host) so the CLI and all existing tests are unchanged.

**Architecture**
New src/host/{types.ts,node/*,browser/*}. Refactor src/tui/session.ts, src/tui/main.tsx, src/tui/io.ts, src/tui/autosave.ts and the /open path-completion in src/tui/commands/builtins.ts to call the host. Move pure path helpers (basenameNoExt, extensionOf, ensureExtension, saveFilterFor) out of src/runtime/files.ts into a platform-neutral src/runtime/paths.ts. Keep src/core and src/shared untouched (they already have zero node: imports).

**Key decisions**
- Constructor injection of a host object rather than bundler-level module aliasing.
- Node keeps current behaviour exactly; browser host is additive.
- Replace Buffer usage in src/tui/io.ts with TextEncoder/TextDecoder and plain Uint8Array.

**Alternatives considered**
- esbuild define/alias module swap per platform — rejected: tests and the mixed graph need both hosts, and runtime state does not map to a build flag.
- Feature-detect with dynamic import('node:fs') — rejected: still emits node: into the browser bundle graph.

**Acceptance criteria**
- All existing 222 tests pass unchanged after the refactor.
- rg 'from "node:' under src/tui and src/runtime only matches host/node plus Node entrypoints (main.tsx, prismNode.ts, control/*).
- Session can be constructed with an explicit host in a unit test.

**Comments**
- Do this first; every other web card depends on it.

### FEAT-113 — Remove stale Electron/desktop build artifacts + dead externals
- priority: low
- tags: plan-constraint-compliance-web-tui, constraints, web, hc003, plan-constraint-compliance-static-web-tui-hc003-constraint-hardening, cleanup, build
- created: 2026-09-18
- updated: 2026-09-18
- plan: constraint-compliance-static-web-tui-hc003-constraint-hardening
- kind: card
- parent: FEAT-100

**Plan:** Constraint compliance: static web TUI (HC003) + constraint hardening _(#plan-constraint-compliance-static-web-tui-hc003-constraint-hardening)_

**Plan summary**
The project is healthy (typecheck clean, 222 tests passing, Ink TUI, TypeScript) but two blocking constraints are only partly satisfied. HC003 (desktop + web-deployed app) has NO web target: scripts/build-tui.mjs emits a Node bundle only, dist/renderer is stale Electron leftover, and the 0008 sibling's build:web/Playwright web config were dropped during the Terminal migration. HC004 is implemented by scripts/audit-dependencies.mjs but CONSTRAINTS.md declares zero machine directives, so constraints_validate can't enforce anything. HC002 (2-press reachability) is unverified. Plan: (1) add a static browser target for the same Ink TUI — a HostServices seam so core/TUI stop importing node:, browser asset/persistence/audio/WASM hosts, an xterm.js terminal bridge around Ink, a web frame with non-TUI buttons, a Vite web build and Playwright web tests; (2) harden CONSTRAINTS.md with machine checks + generated tests, audit 2-press reachability, verify cross-platform desktop behavior, and refresh the dependency allowlist. The already-carded BPM plan (FEAT-78..85) is NOT re-planned here and remains pending. User chose the client-side static web approach over a server-streamed Ink/xterm option.

**Approach**
Delete stale dist/main, dist/preload and dist/renderer artifacts (leftover from the pre-Terminal Electron build; dist is gitignored but confusing), add an npm clean script, and drop the now-meaningless 'react-dom' entry from scripts/build-tui.mjs externals. Confirm assets shipping and the prism worker bundle are unaffected.

**Architecture**
package.json (clean script), scripts/build-tui.mjs (external list).

**Key decisions**
- dist is disposable build output; clean regenerates it.
- Do not resurrect any Electron source — the web target is a fresh Vite build (see web cards).

**Alternatives considered**
- Keep the stale dist for reference — rejected: it misleads agents and the web target is unrelated.

**Acceptance criteria**
- dist/ contains only tui (and web once built) after a clean build.
- build-tui.mjs externals list matches actual runtime externals.
- npm run build:tui still succeeds.

### FEAT-86 — UX pass — context actions, safety, and discoverability
- updated: 2026-09-17

- priority: critical
- tags: plan-ux-pass-context-actions-safety-and-discoverability, epic
- created: 2026-09-17
- updated: 2026-09-18
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: epic

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Cards**

- FEAT-87 — Shared context-action model + ActionMenu primitive
- FEAT-88 — Tracker cell context menu on Enter
- FEAT-89 — Instrument row context menu + duplicate instrument
- FEAT-90 — Source-sample context menu, assign + new instrument from sample
- FEAT-91 — Order/pattern context menu + Go-to-order overlay
- FEAT-92 — Global undo/redo for structural and settings edits
- FEAT-93 — Unsaved-changes guard for quit / new / open / restore
- FEAT-94 — Save As + recent projects
- FEAT-95 — Pattern / order loop playback
- FEAT-96 — Contextual action hints in explainer and status bar
- FEAT-97 — Command palette upgrades: ':' alias, arg help, recent commands
- FEAT-98 — Param editor ergonomics: defaults, modified markers, filter, layer affordance
- FEAT-99 — Import a source sample (WAV/OGG) into a slot

### FEAT-99 — Import a source sample (WAV/OGG) into a slot
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, samples, io, workflow, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Samples are limited to six bundled OGG files, and there is no way in. The project format and loader already support embedded samples via SourceSampleRef.dataUrl, so importing is mostly wiring: read file -> base64 data URL -> update project slot -> reload engine.

**Architecture**
New io.ts `importSample(session, slot, filePath)`: read bytes (runtime/files readBytesSafe), sniff/validate audio, encode `data:audio/*;base64,...`, set project.sourceSamples[slot] = {name: basenameNoExt(filePath), url:null, comments:'', dataUrl}, then reload the sampler so the slot is audible. Add /importsample <slot|next> <file> (path completion via the existing pathArg) and a SamplesOverlay menu item 'Import sample…' using the same path prompt. node-web-audio-api's decodeAudioData handles WAV/OGG/MP3.

**Key decisions**

- Embed as dataUrl so projects stay self-contained and portable (already how loadedSongFromProjectText works).
- Warn in the status line about project size growth for large files.
- Import overwrites the target slot; use a dedicated slot or 'next empty' to avoid clobbering bundled clips.

**Alternatives considered**

- Reference the external file path instead of embedding — smaller projects but breaks portability and the current loader only reads bundled paths or dataUrl; rejected.
- A full sample editor (trim/pitch/detect) — out of scope; the Sampler already has trim/ADSR.

**Open questions**

- Keep a hard cap on embedded size (e.g. 20 MB) with a clear error?
- Offer 'next empty slot' as the default target?

**Depends on**

- Source-sample context menu, assign + new instrument from sample

**Acceptance criteria**

- `/importsample 3 ~/kick.wav` makes slot 3 previewable and playable by an instrument pointing at it.
- Saved .lampjson embeds the sample and reloads on another machine.
- Errors are clear for missing/unsupported/oversized files.

### FEAT-98 — Param editor ergonomics: defaults, modified markers, filter, layer affordance
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, editors, instruments, spectral, percussion, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Long editor lists (~30 sampler params) give no sense of what was changed, no way to reset, no way to find a param, and no explicit way to add the Spectral/Percussion layers. Add defaults + modified marker + filter + layer toggles.

**Architecture**
ParamEditorOverlay: add `defaultValue?` and `onReset?` to EditorParam; mark rows that differ from default with a dot; bind a key (r) to reset the highlighted param and Ctrl+R / a menu item to reset the group. Add a filter mode (/) that narrows visible params by label/group. editors.tsx: populate defaultValue from the default* factories and expose 'Add Spectral layer' / 'Add Percussion stage' actions at the top of the relevant tabs (toggling spectral.enabled / percussion.enabled) so the sampler->spectral->percussion chain is actionable, not just described in the tab line.

**Key decisions**

- Reset writes the default through the same setter, so preview/autosave/history (FEAT-92) all apply.
- Filter is client-side over EditorGroup; no change to Session.

**Alternatives considered**

- A/B compare of before/after renders — attractive but needs two render paths and more state; noted as a follow-up, not this card.
- Collapsible groups only — helps length but not 'what changed'; rejected as the primary fix.

**Depends on**

- Global undo/redo for structural and settings edits

**Acceptance criteria**

- Modified params are visually distinct; r resets the highlighted param; filter narrows the list and resets on close.
- Add-layer actions turn the mode on and switch to its tab.
- Editor still scrolls to stepthrough highlights.

### FEAT-97 — Command palette upgrades: ':' alias, arg help, recent commands
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, commands, palette, discoverability, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
The palette is fast but opaque: it lists names + one-line descriptions and nothing about arguments or what was used recently. Add an argument/example pane, a recent-commands section, and accept ':' as an alias for '/'.

**Architecture**
commands/types.ts: add optional `examples?: string[]` and richer `args` already exists. CommandBar: when the highlighted suggestion is a command, show its usage string + first example on the selected row or a detail line beneath the list. App: when input is empty/just ':' show a 'Recent' group from state.commandHistory (dedup, cap 5) above the fuzzy list; accept ':' as the palette trigger alongside '/'. Optionally Tab-complete flags (--flood, --clone, --loops, --fade, --normalize) via the existing completion hook.

**Key decisions**

- Do not add new commands — improve discovery of existing ones.
- Recent list comes from the existing commandHistory, no new state.

**Alternatives considered**

- A full-screen command browser — rejected: HelpOverlay already fills that role; the palette should stay lightweight.

**Acceptance criteria**

- ':' opens the palette; selected command shows usage + example; recent commands appear when input is empty.
- Flag completion works for the commands that define flags.

### FEAT-96 — Contextual action hints in explainer and status bar
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, explainer, statusbar, discoverability
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
The explainer says what a cell/menu row IS; make it also say what you can DO there, and make the bottom hint change with context instead of a fixed generic line. This is the passive-teaching half of the context-action work.

**Architecture**
explainer.ts: extend ExplainerText to optionally list actions, and have explainCursor append the top 3-4 contextActions for the cursor (reusing FEAT-87's resolver) as a compact 'Actions: v edit · enter menu · ctrl+space audition' line. App.tsx StatusBar default hint becomes context-derived: note column vs ins/vol/fx column vs selection active vs menu open. Editor overlays already pass a per-view hint; extend the same mechanism to the tracker and to stepthrough.

**Key decisions**

- Derive hints from the same contextActions list the menu uses, so docs and behaviour cannot drift.
- Cap the hint length to the terminal width; truncate gracefully.

**Alternatives considered**

- Only improve the ? help overlay — rejected: help is consulted after the user is already stuck; contextual hints teach in place.
- A one-time tutorial — rejected (see stepthrough, which already covers the full rebuild).

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- Moving across note/ins/vol/fx columns changes the explainer's action list and the status hint.
- With a selection active, block-op hints appear.
- No layout/repaint regression at wide and narrow terminal sizes.

### FEAT-95 — Pattern / order loop playback
- updated: 2026-09-17

- priority: high
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, audio, transport, tracker, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
The engine already loops the whole song (currentTime wraps songDuration), but there is no single-order loop — the core tracker editing workflow. Add a loop mode (song | order) with the looped order highlighted, toggled by a direct key.

**Architecture**
Core: represent the loop as a row range derived from the sequence: `loopRangeForOrder(song, order): {startRow,endRow}` (pure, testable) using rowTimes. Session: add `loopMode:'song'|'order'` and `loopOrder` to state; `setLoopMode(mode)` and `toggleOrderLoop()`. WebAudioBackend: pass the active range into Scheduler so the scheduler wraps at endRow back to startRow instead of songDuration; keep the existing whole-song wrap when mode is song. Header/PatternView show a 'LOOP order NN' badge and tint the looped rows/order. Bind a key (e.g. `L`) in tracker mode; also expose /loop [song|order|toggle].

**Key decisions**

- Implement the wrap in the Scheduler using existing rowTimes — no new timing model.
- Default remains song loop to preserve current behaviour.
- Looping follows the view order unless the user pins an order.

**Alternatives considered**

- Loop an arbitrary selected row range — more powerful but more UI; start with single-order and note range-loop as a follow-up.
- Rely on seeking/replaying from App — rejected: causes audible gaps and fights the audio clock.

**Open questions**

- Should pressing play with follow off loop the viewed order automatically, or only when explicitly enabled?
- Pin the loop to an order number, or always follow viewOrder?

**Acceptance criteria**

- `L` toggles order loop; the current order repeats seamlessly with no gap.
- Whole-song loop still works and is the default.
- Unit test covers loopRangeForOrder and scheduler wrap boundaries.

### FEAT-94 — Save As + recent projects
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, io, save, recent, config, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Add Save As and a recent-projects list so users can fork a project and jump back into prior work without retyping paths.

**Architecture**
commands/builtins.ts: add /save-as <path> (aliases saveas, writeas) reusing saveProject; bind Ctrl+Shift+S in App to prefill `/save-as `. Extend LanternConfig with `recentProjects?: string[]` (cap 10, dedup, most-recent first); recordLastProject also unshifts into it. Add /recent command that opens an ActionMenu listing recent paths (with the missing-file ones greyed/disabled) and opens the selected one via openPath. Optionally surface the list when startup cannot resolve a default project.

**Key decisions**

- Keep lastProject as-is for startup; recentProjects is additive and never breaks older config files (sanitizeConfig ignores unknown fields already).
- Save As always updates projectPath and records the new path.

**Alternatives considered**

- Read the filesystem for *.lampjson in the cwd — rejected: noisy and does not reflect the user's actual history.
- Replace lastProject with recent[0] — rejected: unnecessary migration churn.

**Acceptance criteria**

- Ctrl+Shift+S / `/save-as` writes to a new path and subsequent Ctrl+S targets it.
- `/recent` lists up to 10 existing paths and opens the chosen one; missing paths are shown but not selectable.
- Config round-trips through sanitizeConfig in tests.

### FEAT-93 — Unsaved-changes guard for quit / new / open / restore
- updated: 2026-09-17

- priority: high
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, safety, io, ux, confirm
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
When the project is dirty, intercept every action that would discard it and show a three-way Save / Discard / Cancel prompt. Autosave backup exists, but it is not a substitute for user intent.

**Architecture**
Add a reusable ConfirmDialog (or reuse ActionMenu with three items). In App/commands: `quit` (and the `q`/Ctrl+C path) and the `/new`, `/open`, `/restore` commands check `session.getState().dirty`; if dirty, set a `pendingAction` and show the dialog. Save runs the existing /save path (prompting for a path when projectPath is null, as Ctrl+S already does), then performs the pending action; Discard performs it; Cancel clears it. Session gains `hasUnsavedChanges()` returning state.dirty (dirty is already maintained).

**Key decisions**

- Three explicit choices, defaulting to Cancel, never a y/n that can be fat-fingered.
- Reuse the existing Ctrl+S save flow so there is one save implementation.
- Restore counts as destructive because it reloads a different state over the live model.

**Alternatives considered**

- Auto-save the live project to the backup on every quit — already happens every 15 actions, but does not tell the user their named project is unsaved; rejected as the only guard.
- Block quit entirely when dirty — rejected: users must be able to exit without saving.

**Open questions**

- Should a new/unsaved project (projectPath === null) skip the 'Save?' option and only offer Discard/Cancel, or prompt for a path?

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- Quit/new/open/restore with dirty state always prompts; Cancel is a no-op; Discard proceeds; Save writes then proceeds.
- Clean state performs the action with no prompt.
- Covered by unit tests on the command layer.

### FEAT-92 — Global undo/redo for structural and settings edits
- updated: 2026-09-17

- priority: critical
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, core, undo, history, safety, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Undo currently covers only pattern cells and is actively destroyed by any order operation. Unify history so every mutating action is undoable in order. Because structural/settings edits do not map to per-cell HistoryEntry, capture a whole-project memento for those and keep the existing cell-level entries for tracker edits, all on one tagged stack.

**Architecture**
Session: introduce `type UndoEntry = {kind:'cells', entries:HistoryEntry[]} | {kind:'project', before:SessionMemento, after:SessionMemento, label:string}` where SessionMemento is the structuredClone of {project, song-invariant fields?, settings, instrumentNames, sampleNames, channelVolume, channelMuted, masterVolume, masterFx, mutedInstruments, refPitchEnabled}. Add `pushProjectMemento(label)` called BEFORE mutating in: insertPattern(At), removePattern(At), moveOrder, setOrderPatternNumber, clearAllPatterns, addInstrument, deleteInstrument, duplicateInstrument, setInstrumentName, updateSamplerSetting, updateSampleInfo, setChannelMute/toggle, setChannelVolume, setMasterVolume, setMasterFx/patchMasterFx, and the editable Song Info menu (FEAT-82). Replace the many `this.history = []` wipes with pushes; keep redoStack symmetric. Cap the stack (e.g. 100 entries) and drop the oldest. `undo()/redo()` pop a single tagged stack; for 'project' mementos, restore the memento and rebuild sequence/engine. Keep the existing per-cell granularity so Ctrl+Z on a note edit undoes one cell, matching today.

**Key decisions**

- Snapshot-based mementos for structural/settings edits (few, coarse) + existing cell entries for tracker edits (many, fine).
- Undo label is surfaced through /status and the status bar so users know what Ctrl+Z will do (e.g. 'Undo: delete instrument 2').
- Autosave (markAction) fires inside the same code paths as today; undo/redo also counts as an action.

**Alternatives considered**

- Full command/toolbox pattern for every mutation — more code and every Session method must implement do/undo; rejected as too invasive for this pass.
- Full-project snapshot before every single cell edit — memory/serialization heavy on long patterns; rejected.
- Document that only pattern edits are undoable — rejected: order moves wiping the stack is a data-loss bug, not a UX preference.

**Open questions**

- Do we deep-clone the whole SongModel per memento or only the fields structural ops touch? SongModel is derived from project; rebuilding it on restore via buildSongModelFromProject may be enough and cheaper.

**Acceptance criteria**

- Ctrl+Z reverses, in order: a sampler param change, an instrument add, an order move, a sample rename, a mixer change, and a cell edit.
- An order move no longer clears the existing undo stack.
- Redo re-applies each.
- typecheck + full test suite green; new unit tests cover ordering, cap, and memento restore.

### FEAT-91 — Order/pattern context menu + Go-to-order overlay
- updated: 2026-09-17

- priority: medium
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, patterns, orders, context-menu, navigation
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Add a fast 'go to order' picker and surface the Pattern-Manager actions for the currently viewed order, rather than forcing a trip through /patterns. [ and ] keep cycling; a new key (g) or the tracker menu opens the picker.

**Architecture**
New lightweight OrderPicker overlay (reuse ActionMenu with numeric filtering, or a compact list windowed like PatternsOverlay) triggered by `g` or the tracker cell menu's 'Go to order…' item. It lists order numbers with their pattern number and view marker, supports typing digits to jump, Enter calls session.setViewOrder(order) (and optionally seekTo). The tracker cell menu also exposes Insert order / Duplicate order / Remove order / Move up / Move down / Set pattern number for the viewed order, all delegating to existing session methods (insertPatternAt, removePatternAt, moveOrder, setOrderPatternNumber).

**Key decisions**

- Go-to-order is navigation only; structural order edits stay confirmed/undoable via the Pattern Manager and the new history model.
- Reuse existing Session methods; no new core logic.

**Alternatives considered**

- Extend the header OrderStrip into a clickable/selectable strip — rejected: mouse/terminal focus complexity; a picker is simpler and works at any song length.
- Only rely on /patterns — rejected: it is a heavyweight detour for a one-step jump.

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- `g` (or the menu item) opens a picker; digits + Enter jumps the view and playhead consistently.
- Order structural actions are reachable from the tracker and match Pattern-Manager behaviour.
- Picker handles songs longer than the viewport.

### FEAT-90 — Source-sample context menu, assign + new instrument from sample
- updated: 2026-09-17

- priority: high
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, samples, instruments, context-menu, workflow
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
In SamplesOverlay, Enter opens an ActionMenu for the selected slot, and add the missing sample->instrument bridge so users can act on a sample where they found it. This closes the one-way Samples->Instruments gap.

**Architecture**
SamplesOverlay: Enter opens ActionMenu with Preview (p), Rename & info (today's edit), Assign to instrument… (pick an instrument index from a submenu, sets settings.sourceIndex = slot), New instrument from this sample (Session.addInstrumentFromSample(slot)), and Open linked instruments (jump to InstrumentsOverlay filtered/marked to instruments whose sourceIndex === slot). Session.addInstrumentFromSample(slot): addInstrument() then updateSamplerSetting(newIndex,{sourceIndex:slot}) and rename after the sample name; returns index. The Samples overlay already reads state.settings for the instrument list — invert that to show which instruments link to each slot.

**Key decisions**

- Keep p and Enter-edit as accelerators; the menu exposes assign/new/links.
- Reuse Session.addInstrument + updateSamplerSetting rather than a parallel constructor.

**Alternatives considered**

- Only add a `/newinstrumentfromsample` command — rejected: the natural place to invoke it is the sample you are looking at.
- Auto-create an instrument whenever a source is assigned — rejected: surprising and hard to undo (see FEAT-92).

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- From a sample slot: preview, rename, assign to an existing instrument, and create a new named instrument all work without leaving the overlay.
- Linked-instrument view shows the correct instruments per slot.
- New instrument is immediately audible/selectable.

### FEAT-89 — Instrument row context menu + duplicate instrument
- updated: 2026-09-17

- priority: high
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, instruments, context-menu
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
In InstrumentsOverlay, Enter opens the ActionMenu for the selected instrument instead of jumping straight to the sampler tab. Add the missing Session.duplicateInstrument so 'Duplicate' is real, and inline rename.

**Architecture**
InstrumentsOverlay: replace the Enter/`z` handler with `onMenu(index)`; render ActionMenu (or delegate to App via a prop). Items: Edit Sampler / Edit Spectral / Edit Percussion (today's 1/2/3), Rename… (inline text field reusing ParamEditorOverlay's edit buffer pattern), Change source sample… (submenu or jump to SamplesOverlay), Duplicate, Mute (m), Preview (p), Delete (d, keeps the existing y/n confirm). Session.duplicateInstrument(index): clones settings + name ('Name copy'), inserts after index, remaps nothing (pattern references keep the original), returns the new index; must markAction() and respect the new history model from FEAT-92.

**Key decisions**

- Keep 1/2/3, m, p, a, d as accelerators; the menu only adds Rename/Change-source/Duplicate which currently have no direct path.
- Deleting still requires confirmation — do not fold delete into a single Enter action.

**Alternatives considered**

- Add Duplicate as a slash command only — rejected: it is a common editing intent and belongs where instruments are listed.
- Send Rename to the Sampler menu Name param — kept as a fallback, but a list-level rename is faster.

**Open questions**

- Should Change source sample open the Sample picker inline or jump to the Samples overlay with the slot preselected?

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- Enter on an instrument lists all actions; Duplicate creates an identical settings clone with a distinct name.
- Rename applies without leaving the list and marks the project dirty.
- Existing 1/2/3/m/p/a/d behaviour still works.

### FEAT-88 — Tracker cell context menu on Enter
- updated: 2026-09-17

- priority: high
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, tracker, context-menu
- created: 2026-09-17
- updated: 2026-09-17
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Bind a single key (Enter by default, per FEAT-87 open question) in tracker mode to open the ActionMenu for the current cell/selection. This is the direct answer to 'v should be a menu': v remains the fast path to 'edit instrument', while Enter exposes the full set of intents for whatever is under the cursor.

**Architecture**
App.tsx tracker useInput gains a branch that sets `actionTarget = {kind:'tracker', channel:cursor.channel, order:cursor.order, row:cursor.row, column:cursor.column}`. contextActions('tracker') returns items conditioned on the cursor column kind and cell contents: Audition cell (/seek-style playFromCursor), Edit instrument N (the current v action), Choose instrument… (opens InstrumentsOverlay in pick mode), Open source sample (SamplesOverlay positioned at the cell's instrument sourceIndex), Set instrument on cell (/setinstrument), Note off / Clear cell, and — when a selection exists — Copy / Cut / Paste / Flood paste / Interpolate / Transpose. 'Go to order…' item opens the order picker from FEAT-91. Items are enabled/disabled from state (e.g. paste disabled when clipboard empty; instrument items disabled when no song).

**Key decisions**

- Reuse session.playFromCursor(), instrumentAtCursor(), selection() etc. via commands so no new Session surface is needed.
- Keep `v` unchanged as the one-key instrument shortcut (documented in HelpOverlay).

**Alternatives considered**

- Make `v` itself open the menu — rejected: adds a keystroke to the most common action and breaks existing users' muscle memory; Enter is discoverable and currently free.

**Depends on**

- Shared context-action model + ActionMenu primitive

**Acceptance criteria**

- Enter on a note cell offers audition/edit/choose/sample actions; on an FX cell offers clear + effect-related; with a selection offers block ops.
- Every menu item invokes a real registry command and shows in the control-socket action list.
- Esc closes without changing state.

### FEAT-87 — Shared context-action model + ActionMenu primitive
- updated: 2026-09-17

- priority: critical
- tags: ux-audit, plan-ux-pass-context-actions-safety-discoverability, plan-ux-pass-context-actions-safety-and-discoverability, tui, ux, context-menu, keyboard, architecture
- created: 2026-09-17
- updated: 2026-09-18
- plan: ux-pass-context-actions-safety-and-discoverability
- kind: card
- parent: FEAT-86

**Plan:** UX pass — context actions, safety, and discoverability _(#plan-ux-pass-context-actions-safety-and-discoverability)_

**Plan summary**
An audit-driven UX plan for the Lantern TUI. Diagnosis: slash-command coverage is strong, but the tracker surface is a flat set of memorized single keys whose meaning changes per view (x closes a menu but clears a cell; c is note-off but clears all patterns in the Pattern Manager; r is paste but removes an order). The `v` binding is the visible symptom: it hard-wires one guess (open the mode-matched instrument editor) when the user may want to choose an instrument, audition the cell, open the source sample, or act on the selection. Strategy: build ONE reusable context-action resolver + ActionMenu popup, driven by the command registry so TUI, control socket and scripts share it, then hang per-surface menus (tracker cell, instrument row, sample row, order) off it. That single primitive also unlocks contextual "what can I do here" help. Separately: make destructive/structural edits undoable, guard unsaved work, add pattern-loop playback, and close the sample->instrument and sample-import workflow gaps. A terminal cannot draw a radial menu; a keyboard-navigated popup is the idiomatic equivalent and keeps hotkeys as accelerators. Sequencing: primitive first (FEAT-87), then the four surfaces and contextual help, with the safety/playback/workflow cards independent of it.

**Approach**
Introduce one pure resolver that, given SessionState plus a target (tracker cell, instrument row, sample row, order position), returns ordered ContextAction descriptors, and one reusable ActionMenu popup to render/select them. Actions delegate to the command registry so the TUI, the control socket and future .lmpscript runners share a single source of truth — consistent with the project convention that commands are the automation contract.

**Architecture**
New src/tui/contextActions.ts: `type ContextTarget = {kind:'tracker',channel,order,row,column} | {kind:'instrument',index} | {kind:'sample',slot} | {kind:'order',order}`; `interface ContextAction { id; label; hint?; keys?; enabled?; command }` where `command` is a slash-command string (e.g. '/spectral 2'); `function contextActions(state, target): ContextAction[]`. New src/tui/components/ActionMenu.tsx: bordered vertical list in the left pane; Arrow/j/k move, 1-9 jump, Enter runs, Esc closes, dim hint line; purely presentational (active/target/onSelect/onClose). App owns `actionTarget: ContextTarget | null`; when set it renders ActionMenu in place of the tracker and routes input to it; actions that open overlays reuse the existing CommandContext.openOverlay plumbing. Add a `/actions [target]` builtin returning contextActions as JSON so scripts can enumerate and invoke the same actions.

**Key decisions**

- Menus invoke commands (registry ids/strings), not Session methods directly — keeps the command registry the single automation contract.
- Esc becomes the single universal cancel/close key; drop `q`/`x` as close aliases (they collide with tracker q/a adjust and x clear).
- Existing accelerators (v, 1/2/3, m, p) stay as shortcuts; the menu adds discoverability, it does not replace muscle memory.
- contextActions is a pure function over a state snapshot so stepthrough's preview state works unchanged.

**Alternatives considered**

- A literal radial/circular menu — rejected: terminal cells are rectangular and Ink has no canvas; a keyboard-navigated vertical popup is the idiomatic equivalent.
- Hard-code a handler per overlay — rejected: that is the current duplicated key handling we are removing.
- Put actions on Session and have the menu call them directly — rejected: breaks the command/script parity contract.

**Open questions**

- Default tracker-menu key: Enter (unused in tracker today, means execute in menus) or `.` (unused, mnemonic for 'more')?
- Should ActionMenu render inside the tracker viewport (overlaying rows) or as a transient left-pane replacement? Overlay is simpler; replacement avoids Ink clipping.

**Acceptance criteria**

- contextActions + ActionMenu land with unit tests per target kind (resolved ids/labels/disabled states).
- `/actions` returns exactly the list the UI shows for a given target.
- No regression to existing overlay hotkeys.

### FEAT-77 — Ctrl+S saves the current project

- priority: medium
- tags: tui, keyboard, io, save, ux
- created: 2026-09-17
- updated: 2026-09-17

Ctrl+S saves the current project.

- SessionState gained `projectPath` (set by io.openPath/saveProject, cleared by applyLoaded/new/restore) plus `setProjectPath`.
- App tracker key handler on Ctrl+S: if `projectPath` is known, runs `/save "<path>"` (same command path as the command bar); otherwise opens the palette prefilled with `/save ` so a new/unsaved project can be named.
- HelpOverlay documents Ctrl+S.

Verified live in a pty: with a saved project, Ctrl+S rewrites the file; with no path, Ctrl+S opens the `/save ` prompt. Tests assert the projectPath lifecycle (save/open set it, /new clears it). 205 tests pass.

### BUG-16 — Note release made the previous note jump back to full volume

- priority: high
- tags: audio, sampler, bug, release, web-audio
- created: 2026-09-17
- updated: 2026-09-17

Order 01 rows 5-6: notes on channels 2-4 (Instrument 2) appeared to raise the volume of the previous notes ~0.1s before the new note.

Root cause: the sequencer looks 0.15s ahead, so at ~row 5 it schedules the row-6 note and calls `Voice.release(when, 0.008)` on the previous voice with `when` in the future. `release()` used `gain.gain.cancelScheduledValues(when)`, which removes the in-flight ADSR decay ramp; the parameter then holds the attack-ramp value (full level) from the release scheduling until `when`, then jumps to the computed level and fades. Hence the previous note's volume "came back up" before the new note.

Fix (`src/audio/webSampler.ts` `Voice.release`): use `cancelAndHoldAtTime(when)` when available to preserve the envelope value at `when`, then re-anchor with `linearRampToValueAtTime(level, when)` (node-web-audio-api mis-schedules a ramp added directly after the hold), then ramp to 0 over the fade. Fall back to the old cancel+set when the API is absent.

Verified with an OfflineAudioContext render: old code gave gain 1.0/1.0/1.0 at 0.3/0.5/0.6s; fixed code gives 0.645/0.404/0.283 (the correct decay), fading to 0 after. Also affects audition previews (release scheduled ahead of time).

### FEAT-76 — Channel + master volume meters in the Explainer panel (red on clip)

- priority: medium
- tags: tui, explainer, meters, audio, ux
- created: 2026-09-17
- updated: 2026-09-17

Live CH1–CH4 + master peak meters at the bottom of the persistent Explainer panel; the panel is shortened by the meter block and the meters turn red (with a CLIP marker) at/above full scale.

- ExplainerPanel gained an optional `session` prop; it polls `session.meterLevels()` every 100ms (local state, so only the panel re-renders) and renders `levels` + five MeterRows (CH1..CH4, MAS) pinned below a flexGrow body.
- `isClipping(level)` = level >= 1; clipping rows are red/bold with a "CLIP" marker, otherwise green.
- App renders the panel with `height={explainerHeight}` where `explainerHeight = contentHeight - 6`, and `alignSelf="flex-start"` on the panel so the shrink is honoured (panel is now shorter than the tracker).
- Bar width scales with panel width so the CLIP marker never wraps.

Verified live in a pty: meters show live values while playing (CH4 0.67, MAS 0.69) and the panel is shorter. Unit tests cover isClipping and the meter/CLIP rendering. 204 tests pass.

### FEAT-75 — v jumps to the cursor cell's instrument editor (mode-aware tab)

- priority: medium
- tags: tui, tracker, instruments, keyboard, ux
- created: 2026-09-17
- updated: 2026-09-17

Pressing `v` on a tracker cell jumps straight to the associated instrument's editor, choosing the tab by active mode: Percussion > Spectral > Sampler.

- `Session.instrumentAtCursor()`: returns the row's INS value when set, else the channel's held instrument (insTimeline[order][row]).
- `editors.tsx` `instrumentTabFor(settings)`: percussion.enabled -> "percussion", else spectral.enabled -> "spectral", else "sampler".
- App tracker key handler on `v`: resolves the index (clamped to instrument count), setEditInstrument, returnToList=false (Esc returns to the tracker), setOverlay(instrumentTabFor(settings)).
- HelpOverlay documents `v`.

Verified live in a pty: `v` on the bundled song opened "Spectral — StringSynth 1" (the instrument had Spectral on). Unit tests cover instrumentAtCursor and instrumentTabFor routing. 203 tests pass.

### FEAT-74 — Instruments panel: add/delete with confirm, and rename in Sampler menu

- priority: high
- tags: tui, instruments, sampler, ux, commands
- created: 2026-09-17
- updated: 2026-09-17

Instruments panel needs add/delete (delete with an "Are you sure?" prompt), and the Sampler menu needs an instrument-name parameter as its first entry.

Approach:

- Session gains the single action surface: `instrumentName(index)`, `setInstrumentName(index, name)`, `addInstrument()` (appends a defaultSamplerSettings + InstrumentInfo + name), `deleteInstrument(index)` (remaps INS cells via remapInstrumentsAfterDelete on a patternSnapshot, drops settings/song.instruments/project.instrumentNames, recomputes instrumentColor, calls engine.replaceSettings + updateSequence). Deleting the last instrument is refused.
- ParamEditorOverlay gains a "text" param kind (display/initial/parse/describe; left/right is a no-op, Enter types).
- editors.tsx `samplerGroups` adds an "Instrument" group whose first/only param is "Name" (kind text), placed before the Waveform group so it is the first parameter in the Sampler menu.
- InstrumentsOverlay: `a` adds an instrument, `d`/Delete opens an inline "Delete instrument NN? y/n" confirm; y deletes, n/Esc cancels. Clamp selection after delete. Hint line updated.
- Commands `/addinstrument` and `/delinstrument [index]` expose the same Session actions for the control socket; the interactive confirm stays in the panel.
- instrumentExplain hint updated.

Acceptance: add appends an instrument and it is editable; delete asks for confirmation and remaps pattern INS references; rename from the Sampler menu's first param persists into the saved project; typecheck/tests/build green.

### FEAT-73 — Program overview in KANBAN.md + delete legacy manage/KANBAN-old.md

- priority: low
- tags: docs, cleanup, kanban, fur-removal
- created: 2026-09-17
- updated: 2026-09-17

Moving forward, the project is its own standalone sampler tracker with no Furnace integration.

Actions:

1. Delete manage/KANBAN-old.md (historical pre-TUI backlog) — no longer a source of truth.
2. Add a "Project overview" section near the top of KANBAN.md for future agents: what Lantern is (Node/TypeScript/Ink terminal sampler tracker; 4-channel tracker-style patterns, sampler + spectral/percussion synthesis, mixer/master FX, project IO, stepthrough tutorial, control socket), the architecture map (src/core framework-agnostic model/parser-free, src/audio node-web-audio-api, src/tui Ink UI, src/runtime config/IO, src/control socket, src/wasm prism DSP), how to build/test/run (npm run dev:tui, npm test, npm run typecheck), key conventions (Session is the single action surface; commands registry drives TUI + scripts; project files are .lampjson) and the persistence model (config at ~/.config/lantern/config.json, autosave backup.lmpjson, /restore).

Acceptance: manage/KANBAN-old.md is gone; KANBAN.md has an accurate, concise overview that lets a new agent orient without reading src; no Furnace/.fur mentions remain in live docs.

### FEAT-72 — Startup auto-open of last project + /default-open-override

- priority: medium
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, startup, commands
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Resolve which file to open at startup from the config, open it, and record every successfully opened/saved project as lastProject. Add a command to pin a default file, restore 'last', or turn auto-open off.

**Architecture**
src/runtime/config.ts (card 4) stores lastProject and defaultOpen. New src/tui/startup.ts exports resolveStartupProject(config): returns a path or null with precedence defaultOpen.file > defaultOpen 'off' => null > lastProject > null. main.tsx: after WASM init, read config, resolve; if a path is returned call openPath(session, path) and on failure setError + fall back to session.init() (bundled default); else session.init(). Record last project: openPath() success and saveProject() success call recordLastProject(path). /default-open-override command in builtins: bare shows current mode; 'off' sets {mode:'off'}; 'last' sets {mode:'last'}; otherwise treat the arg as a path ({mode:'file', path}) after checking it exists. Returns status.

**Key decisions**

- Precedence: explicit default file > off > last-opened > bundled default.
- off means always start from the bundled default (auto-open disabled entirely).
- CLI positional argv is out of scope unless trivial; config only.

**Alternatives considered**

- Only remember last-opened and skip the override (rejected: user explicitly asked for the override command).
- Store an absolute vs relative path (use the path as given, resolved to absolute on save).

**Open questions**

- Should /new clear lastProject or leave it? Decision: leave it; unsaved new projects do not update it.
- Should opening a missing default file fall back silently or surface an error? Decision: surface via setError and fall back to bundled.

**Depends on**

- Runtime config file under ~/.config/lantern/config.json

**Acceptance criteria**

- Startup opens defaultOpen.file when set; opens lastProject when defaultOpen is 'last'/unset; opens bundled default when 'off' or nothing recorded.
- open and save both record lastProject.
- /default-open-override <file|off|last> persists and reports; bare invocation reports the current mode.
- Unit tests for resolveStartupProject precedence and config round-trip; pty smoke confirms the last project reopens.

### FEAT-71 — Autosave backup.lmpjson every 15 actions + /restore

- priority: high
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, backup, commands, session
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Count mutating session actions centrally, and every 15th action write the live project to a backup file. /restore reloads it. Keep Session free of Node fs by exposing an autosave hook that main.tsx wires to the IO layer.

**Architecture**
Session: private actionCount; private autosaveHook: (() => void) | null; setAutosaveHook(fn); private markAction() increments and, at the threshold (const AUTOSAVE_EVERY = 15), calls the hook and resets. Call markAction() from every mutating action: commit(), applyEntries() (undo/redo), adjustValue/clearCell/noteOff/applyLastValue/transposeSelection/interpolateSelection/pasteSelection/cutSelection, insertPattern(At)/removePattern(At)/moveOrder/setOrderPatternNumber/clearAllPatterns, updateSamplerSetting, updateSampleInfo, setChannelMute/toggleChannelMute/setChannelVolume/setMasterVolume/setMasterFx/patchMasterFx. Navigation, selection, transport, setReference and setStep do NOT count. New src/tui/autosave.ts: backupPath() = path.join(configDir(), 'backup.lmpjson'); saveBackup(session) = projectToJson(session.buildProjectFile(), true) written atomically; restoreBackup(session) reads via loadedSongFromProjectText + session.load. main.tsx calls session.setAutosaveHook(() => void saveBackup(session)). Add /restore [path] to builtins (default backupPath) returning status 'Restored backup from ...' or a clear error. Expose lastBackupAt via /status rather than spamming the status bar.

**Key decisions**

- Backup lives in the config directory (~/.config/lantern/backup.lmpjson) so /restore works regardless of cwd.
- Threshold is a named constant (15) for easy change and tests.
- Autosave is quiet; /restore reports explicitly.

**Alternatives considered**

- Backup next to the project file (rejected: no project path for /new, and cwd-relative paths are fragile).
- Autosave on a timer (rejected: user asked for action count).
- Put the write in Session (rejected: Session is framework/fs-agnostic by design).

**Open questions**

- Should /restore also be exposed non-interactively via the control socket? (It will be, automatically, via the command registry.)

**Depends on**

- Runtime config file under ~/.config/lantern/config.json

**Acceptance criteria**

- Exactly 15 mutating actions triggers one backup write and resets the counter (unit-tested with a fake hook).
- saveBackup + restoreBackup round-trips edited notes/settings (test).
- /restore reports ok and loads the backup; missing/corrupt backup reports an error.

### FEAT-70 — Runtime config file under ~/.config/lantern/config.json

- priority: medium
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, runtime
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Add a small, dependency-free config module used by both autosave and startup auto-open. Read lazily, write atomically, tolerate missing/malformed files.

**Architecture**
New src/runtime/config.ts: configPath() resolves LANTERN_CONFIG env -> $XDG_CONFIG_HOME/lantern/config.json -> path.join(os.homedir(), '.config', 'lantern', 'config.json'). Interface LanternConfig { lastProject?: string | null; defaultOpen?: { mode: 'last' } | { mode: 'off' } | { mode: 'file'; path: string } }. readConfig(): Promise<LanternConfig> returns {} on ENOENT/parse error. writeConfig(patch): merges then writes a temp file and renames (or reuse writeBytesSafe semantics). recordLastProject(path). Also export configDir() so the autosave card can place backup.lmpjson alongside it. Path resolution helpers exported for tests.

**Key decisions**

- Single JSON file, not a directory of files.
- XDG-style path with an env override so tests and packaged runs are hermetic.

**Alternatives considered**

- Store config in cwd (rejected: cwd varies; startup state would be lost).
- Use a TOML/ini format (rejected: JSON already used everywhere).

**Acceptance criteria**

- Config path respects LANTERN_CONFIG and XDG_CONFIG_HOME.
- Malformed JSON does not throw; it falls back to defaults.
- Round-trip read/write covered by tests.

### FEAT-69 — Furnace removal 3/3 — strip .fur from IO, commands, session state and UI text

- priority: medium
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, io, commands, docs, cleanup
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Remove all remaining .fur/Furnace surfaces: opening, exporting, state, filters and prose.

**Architecture**
src/shared/types.ts: drop raw and furBytes from LoadedSong. src/runtime/assets.ts: stop reading flight_school_night_shift.fur and drop parseFurFile; loadDefaultSong returns { project, samples }. src/runtime/files.ts: drop the fur entry from SAVE_FILTERS. src/tui/io.ts: drop parseFurFile import, the .fur branch in openPath, exportFur, and the unsupported-file message. src/tui/session.ts: drop furBytes from SessionState/initialState/applyLoaded. src/tui/commands/builtins.ts: /open description '.lampjson only', remove fur from /export choices and its handler branch. Scrub comments/strings in src/core/pitch.ts, songModel.ts, project.ts and src/tui/explainer.ts ('Furnace' -> 'tracker' or removed).

**Key decisions**

- Historical docs (manage/KANBAN-old.md) and archived KANBAN cards are not rewritten; only live source/asset/test/markdown docs are scrubbed.
- The .lampjson save filter remains.

**Alternatives considered**

- Keep fur as a hidden export (rejected: user wants no integration).

**Open questions**

- Should the historical manage/KANBAN-old.md also be scrubbed, or is it acceptable as an archive?

**Depends on**

- Furnace removal 2/3 — delete the parser, RawFurModule, fixtures and parser tests

**Acceptance criteria**

- rg -in 'furnace|\.fur\b' src tests assets KANBAN.md returns no live references (manage/KANBAN-old.md excluded by decision).
- /open rejects .fur; /export offers only wav|mid|zip|png.
- npm run typecheck and npm test green.

### FEAT-68 — Furnace removal 2/3 — delete the parser, RawFurModule, fixtures and parser tests

- priority: high
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, core, tests, cleanup
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Delete src/core/fur/ entirely (parse/reader/blocks/error/node) and remove RawFurModule and buildSongModel(raw: RawFurModule) from songModel.ts. Delete the two .fur fixtures and tests/unit/fur.test.ts. Rewrite the tests that built songs by parsing .fur (core.test.ts, tracker.test.ts, export.test.ts) to build the same SongModel from a project snapshot via buildSongModelFromProject.

**Architecture**
Extend the existing tests/unit/fixtures.ts with fixtureSong() -> buildSongModelFromProject(projectFromJson(fixtureText('assets/lmp-default-proj.lampjson'))). Replace parseFurFile(...) call sites in tests/unit/{core,tracker,export}.test.ts. For tests needing a tiny known pattern, add an inline PatternSnapshot fixture in the same file rather than a .fur. Check the timing/audio golden tests (audio-golden, loop-length, modulation, tracker) for .fur-derived expectations and regenerate goldens only if the project-built model diverges; the production default load already uses buildSongModelFromProject because assets/ has no .fur.

**Key decisions**

- Build fixture songs from the bundled project snapshot, matching the production default-load path.
- Delete the parser tests rather than porting them — there is no parser to test.

**Alternatives considered**

- Keep buildSongModel(raw) for tests (rejected: user asked for full removal of RawFurModule).
- Commit a converted .lampjson fixture of each .fur (rejected: the bundled project already serves this purpose).

**Open questions**

- Confirm the audio golden JSONs were generated from a project-built or .fur-built model; if the latter, regenerate and record why.

**Depends on**

- Furnace removal 1/3 — relocate shared song types to a neutral core module

**Acceptance criteria**

- No src/core/fur/ files remain and no *.fur fixtures exist under tests/.
- buildSongModel(raw) and RawFurModule no longer exist.
- npm run typecheck and npm test green.

### FEAT-67 — Furnace removal 1/3 — relocate shared song types to a neutral core module

- priority: high
- tags: fur-removal, persistence, config, autosave, ux, plan-furnace-fur-removal-autosave-restore-startup-auto-open, core, refactor, types
- created: 2026-09-17
- updated: 2026-09-17
- plan: furnace-fur-removal-autosave-restore-startup-auto-open
- kind: card
- parent: FEAT-66

**Plan:** Furnace/.fur removal, autosave + /restore, startup auto-open _(#plan-furnace-fur-removal-autosave-restore-startup-auto-open)_

**Plan summary**
Three requested workstreams. (1) Full removal of Furnace Tracker / .fur: the bundled default already loads from assets/lmp-default-proj.lampjson (there is no .fur in assets/), so the parser is only used for explicit .fur opens and test fixtures. We relocate the shared song types out of src/core/fur/types.ts, delete the parser + fixtures + parser tests, and strip .fur from IO/commands/state/docs. (2) Autosave a backup.lmpjson every 15 mutating actions and add /restore. (3) Persist a small config under ~/.config/lantern/config.json to auto-open the last opened project and add /default-open-override <file|off|last>. Work is sequenced so the type relocation lands first, then parser deletion, then IO/UI cleanup; autosave and startup share the new config module.

**Approach**
Move every model/type definition out of src/core/fur/types.ts into a new src/core/songTypes.ts. The parser files temporarily import from ../songTypes so nothing else changes in this step. This decouples the shared NoteValue/PatternCell/SongModel vocabulary from the Furnace directory before the parser is deleted.

**Architecture**
New src/core/songTypes.ts holds: NoteValue, EffectSlot, PatternCell, Pattern, NoteValue, EffectSlot, PatternCell, Pattern, SongInfo, Subsong, AssetDir, emptyEffectSlot(), emptyPatternCell(). RawFurModule moves across temporarily (removed in card 2). Update every importer: src/core/{pitch,midi,tracker,stepthrough,sampler,songModel,project}.ts, src/shared/types.ts, src/tui/{session,format,explainer}.ts, src/tui/components/PatternView.tsx, and the parser files src/core/fur/{parse,reader,blocks}.ts. Point imports directly at the new module; no re-export shim.

**Key decisions**

- Use src/core/songTypes.ts (not pattern.ts) because it covers cells, instruments and song metadata.
- Do the move as a pure move in one commit so the diff is reviewable, even if RawFurModule is short-lived.

**Alternatives considered**

- Inline the types into songModel.ts (rejected: would create a large import cycle surface).
- Leave types.ts and rename the directory (rejected: still ties core vocabulary to a Furnace-named path).

**Acceptance criteria**

- rg -n 'fur/types|core/fur' src tests shows only parser-internal imports inside src/core/fur/.
- npm run typecheck clean.
- npm test green with no test edits in this card.

### BUG-15 — Shift+arrows selection swallowed by terminal scrollback; e-copy, r-paste, t-cut

- priority: high
- tags: tui, tracker, selection, keyboard, bug
- created: 2026-09-17
- updated: 2026-09-17

Block selection was only reachable via Shift+arrows (App.tsx) and /select. Many terminals capture Shift+arrows for window scrollback, so users could not highlight a block.

Fix: terminal-safe visual selection mode bound to `e`. Pressing `e` anchors a selection at the cursor (Session.startSelection); while active, plain arrows/PageUp/Down/Ctrl+arrows call extendSelection instead of moveCursor. Pressing `e` again copies the block to the clipboard and ends the selection; `t` cuts the highlighted block; `r` pastes the clipboard at the cursor and `Shift+R` flood-pastes to the end of the pattern. Each action sets a StatusBar notification (e.g. "Copied 3 rows × 2 cols", "Cut 2 rows × 1 cols to clipboard", "Pasted from clipboard", "Flood-pasted to end of pattern", "Clipboard is empty", "Nothing highlighted to cut"). Esc clears and exits; the mode resets when any overlay/help/palette/stepthrough opens. The Ctrl+Shift+C/X/V/F clipboard bindings and /copy /cut /paste now also report status. Shift+arrows kept as a fallback. Help text and /select descriptions updated. Added a Session unit test (visual anchor + extend); verified live in a pty that Copied/Pasted/Cut/Flood-pasted notifications appear and 192 tests pass.

### FEAT-65 — UX batch: z/x menu keys, sampler preview, signal chain, clipboard keys, z audition

- priority: high
- tags: tui, ux, keyboard, audio, preview, clipboard
- created: 2026-09-17
- updated: 2026-09-17

Batch of UX fixes: (1) `z` (last value) now auditions the cell like other edits; (2) all Sampler editor params now preview (preview:true) like Spectral/Percussion; (3) the instrument editor shows the signal chain 'chain: sampler -> spectral -> percussion (each transforms the previous)'; (4) `z` acts like Enter and `x` like Esc in menus (ParamEditor, Instruments, Samples, Patterns, Mixer, Help; pattern remove moved to del/r); (5) clipboard moved to Ctrl+Shift+C/X/V (flood Ctrl+Shift+F) so plain Ctrl+C quits the app, with Ctrl+X/V kept as aliases (plain Shift would clash with the uppercase note keys); help text updated.

### BUG-14 — Save/load dropped pattern notes and instrument settings

- priority: critical
- tags: io, save, load, project, bug
- created: 2026-09-17
- updated: 2026-09-17

Saving a project dropped edited pattern notes and instrument settings: saveProject wrote the stored state.project baseline, not the live edits. Added Session.buildProjectFile() which rebuilds a ProjectFile from the live state (settings, instrument names, mutedInstruments, patternSnapshot(song), channel volumes/mutes, master volume/FX) and saveProject now writes it + updates state.project. Also fixed muted instruments not persisting. Added a round-trip test that edits a note + an instrument param, saves, reopens and asserts both survive.

### FEAT-64 — Marquee overflowing step titles in the Stepthrough list

- priority: low
- tags: stepthrough, tui, ux, marquee
- created: 2026-09-17
- updated: 2026-09-17

The Stepthrough Recipe list now marquees the current step's title when it is wider than the panel, instead of truncating to "…". StepPanel ticks a marquee offset every 130ms (reset on step change) and renders a wrapping window of the title; the panel got flexShrink={0} so Ink no longer shrinks it (which was truncating the marquee itself). Verified live in a pty (title window shifts over time) and with a new `marquee` unit test. typecheck clean, 191 tests pass.

### FEAT-63 — Name effects in Stepthrough FX steps

- priority: low
- tags: stepthrough, effects, ux, tracker
- created: 2026-09-17
- updated: 2026-09-17

Stepthrough FX steps now name the effect instead of showing raw hex. cellSummary uses FX_CATALOG to render e.g. "01 - Pitch slide up 20" (and lists multiple effect columns), so the step title/detail read "CH1 00:25 — 01 - Pitch slide up 20". Verified by a buildSteps test asserting the effect name appears, plus a full-suite check that the bundled project's FX steps include named effects.

### FEAT-62 — Reflect 01/02 pitch-slide effects in audition previews

- priority: medium
- tags: tracker, audio, preview, stepthrough, effects, pitch-slide
- created: 2026-09-17
- updated: 2026-09-17

01/02 pitch-slide effects are now reflected in the audition preview, in both normal editing and Stepthrough. Added `pitchSlideRate(baseRate, effect, value, ticks)` in core/tracker (value is 1/32 semitone per tick), PatternNote gained an optional `slideRate`, and WebAudioBackend.previewPattern calls `voice.pitchRamp(slideRate, when, duration)` after building the voice. Session.collectNotes computes the slide target for the previewed row, so both `auditionRow` (live note entry/edits) and Stepthrough pattern steps sound the slide — including FX-only rows that apply to a held note. Verified by the new pure-helper test (0x01 up / 0x02 down / ignores other effects), full 189-test suite, typecheck and build.

### BUG-13 — Note entry/changes had no audio preview; stepthrough note pitch was wrong

- priority: high
- tags: tracker, audio, preview, stepthrough, notes, bug
- created: 2026-09-17
- updated: 2026-09-17

Notes had no quick audio feedback. Fixes: (1) Session.auditionRow plays the tracker row for ~2 rows (rowDuration * 2, matching the original app) and is now called after editCell (note/instrument/volume entry) and adjustValue (q/a/w/s), using noteTimeline/insTimeline like the original; (2) stepthrough note steps now take the note-preview branch BEFORE the Spectral-instrument branch, so they sound the actual pitch (through the fused render when Spectral is on) instead of a fixed-pitch instrument preview; (3) stepthrough note pitch no longer double-applies instrument transpose (buildVoice already applies settings.transpose, so samplerPlaybackRate is now called with 0, matching sequenceFromSong/onAudition). Added tests: auditionRow invokes previewPattern with a positive duration, and editCell triggers an audition.

### BUG-12 — Loop cache returned the Spectral render after stepping back

- priority: high
- tags: audio, sampler, spectral, stepthrough, cache, bug
- created: 2026-09-17
- updated: 2026-09-17

Audio kept playing the Spectral loop after stepping back to a pre-Spectral step. Root cause: SamplerEngine's per-instrument loop cache keyed only on source/start/end/pingPong, not on whether the loop was built from the Spectral/Percussion fused render or the raw sample. Once a Spectral step rendered and previewed, the cache held the fused loop; stepping back to a non-Spectral step with matching trim/source returned that cached fused buffer, so the raw sample was never heard. Fix: add `fused` to LoopCache and to the cache-hit comparison (and set it when writing). Verified with a new webSampler regression test (fused loop !== raw loop once Spectral is disabled) and the full 186-test suite.

### BUG-11 — Stepping backwards did not un-render Spectral

- priority: high
- tags: stepthrough, audio, spectral, bug
- created: 2026-09-17
- updated: 2026-09-17

Stepping backwards in the recipe did not un-do Spectral: the editor waveforms read the audio engine's effective/fused waveform, but the engine was re-synced to the older step 220ms later with no re-render, so the Spectral render stayed visible (and the live fused buffers were left overwritten on exit). Fix: (1) App bumps a tick after Session.previewBuildStep resolves, forcing the editor groups/waveforms to redraw from the re-synced engine; (2) Session.restoreStepAudio now re-renders the live Spectral/Percussion instruments on exit so leaving mid-build doesn't leave partial renders in the engine. Verified with a pty comparison: the step-16 sampler waveform reached directly is byte-identical to the waveform reached by stepping forward past Spectral then back. typecheck clean, 185 tests pass.

### BUG-10 — Stepthrough: off-screen highlighted params + silent Spectral steps

- priority: high
- tags: stepthrough, tui, audio, spectral, ux, bug
- created: 2026-09-17
- updated: 2026-09-17

Two stepthrough bugs reported after FEAT-61: (1) the highlighted parameter could be past the editor's scroll window (e.g. Step 66 "Depth" in Vibrato was off-screen) — ParamEditorOverlay now scrolls to (and selects) the stepthrough-highlighted param; (2) the "Spectral on" step made no audible change because the fused render for the partial settings was never produced — Session.previewBuildStep is now async, renders the fusion for Spectral/Percussion steps, waits for the render (token-guarded against stale navigations) and previews the result. Also added generator guards so steps are only emitted for options the menus actually show (voice cap only when polyphonic; Source B fields only when the mode uses B; only the current algorithm's amount). Verified live in a pty (Step 66 Vibrato/Depth visible and selected; Step 24 "spectral on" shows "Waveform (fused render)") and by 185 passing tests incl. a new scroll-to-highlight regression test.

### FEAT-61 — Stepthrough refinements: chapters, blank start, step audio preview, menu order

- priority: high
- tags: stepthrough, tui, audio, ux, generator
- created: 2026-09-17
- updated: 2026-09-17

Stepthrough refinements: (1) [ and ] now jump to the prev/next chapter (same as PgUp/PgDn); (2) StepPanel shows chapter headings (SONG, SOURCE SAMPLES, INSTRUMENTS, MIXER, MASTER FX, PATTERNS); (3) the panel is titled "Stepthrough Recipe" with an n/N progress line; (4) stepthrough now starts from a blank project (blankTargetFrom: same structure, all values default) and applies steps 0..N inclusive so the project visibly and audibly builds up; (5) each step auditions the current sound via Session.previewBuildStep — syncs the audio engine (sequence, per-instrument settings, mixer, master FX) to the partial snapshot and previews the instrument or the exact note/pitch, restoring the live audio on exit; (6) the generator now emits instrument/spectral fields in the exact order the editor menus show them. Verified live in a pty (title, chapters, [ ] jumps, blank start with names/sources filling in, menu-ordered steps) and by 184 tests + typecheck + build.

### FEAT-53 — Stepthrough mode — progressive project rebuild tutorial

- priority: critical
- tags: plan-stepthrough-mode-progressive-project-rebuild-tutorial, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: epic

IMPLEMENTED. STEPTHROUGH mode: reads the loaded .lampjson + SongModel and synthesises a BuildStep recipe (core/src/stepthrough.ts), then presents it as a navigable, progressively-rebuilding tutorial. `/stepthrough` (aliases walkthrough, steps) enters; the right-hand StepPanel replaces the Explainer; ↑↓ steps, PgUp/PgDn chapters, Home/End, Esc (or `/stepthrough off`) exits. The left pane shows the target screen — SongInfo, Source Samples, Instruments, Sampler/Spectral/Percussion tab, Mixer, Master FX, Pattern Manager or the tracker — positioned at the step and with the step's parameters/cells highlighted (◆ in editors, yellow cells in the tracker). It progressively applies steps 0..N to a structuredClone of the model (Session.snapshotTarget) so the project visibly grows; the live session/audio is never mutated. Every step carries a structured action, and `/stepexport <path>` writes the recipe as JSON for future automation. Bundled project produces 621 per-row steps. Verified live in a pty (song/sample/param/tracker steps, highlighting, exit restore) and by 184 passing tests (core generator + round-trip + apply, StepPanel, App enter/navigate/exit, export).

### FEAT-60 — Tests for stepthrough (generator, apply, navigation, highlights)

- priority: high
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, tests
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Unit-test buildSteps/applyBuildStep (ordering, non-default filtering, round-trip on covered fields, stable ids) and component-test StepPanel navigation + highlight rendering with ink-testing-library.

**Architecture**
tests/unit/stepthrough.test.ts + extend tui-components/tui-explainer.

**Key decisions**

- Generator tested without Ink.

**Alternatives considered**

- pty-only (rejected).

**Depends on**

- Core: BuildTarget, BuildStep model, buildSteps + applyBuildStep
- App: /stepthrough mode shell, StepPanel, navigation

**Acceptance criteria**

- New tests pass alongside the existing 177.

### FEAT-59 — Structured actions + /stepthrough export recipe (automation groundwork)

- priority: medium
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, export
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Every step already carries a structured action. Add `/stepthrough export [path]` to serialise BuildStep[] as JSON (or .lmpscript) so a future runner can execute the recipe against a fresh project.

**Architecture**
Export is pure serialisation; action vocab mirrors command names where possible.

**Key decisions**

- Declarative actions, not executed here.

**Alternatives considered**

- New DSL now (rejected).

**Depends on**

- Core: BuildTarget, BuildStep model, buildSteps + applyBuildStep

**Acceptance criteria**

- Export writes a valid recipe file.

### FEAT-58 — Step → screen resolver (target view + positioning + highlights)

- priority: critical
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, resolver
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Map a BuildStep (screen + instrument/order + highlights) onto App overlay state: setOverlay, editInstrument, editor tab, viewOrder, cursor/selection; attach highlights. Add a compact SongInfo view for the song/timing chapter.

**Architecture**
Extends the Overlay union and tab logic. tracker → PatternView positioned at order/row; sampler|spectral|percussion → ParamEditorOverlay on that tab; instruments|mixer|samples|patterns → their overlays; song → SongInfo.

**Key decisions**

- Reuse manual overlay behavior; no bespoke step views.

**Alternatives considered**

- Separate step views (rejected).

**Depends on**

- Session/App: stepthrough preview state (progressive rebuild)
- Highlight primitives across existing views
- App: /stepthrough mode shell, StepPanel, navigation

**Acceptance criteria**

- Every StepScreen renders the right view and positions the tracker/editor correctly.

### FEAT-57 — App: /stepthrough mode shell, StepPanel, navigation

- priority: critical
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, app, commands
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Add /stepthrough (alias /walkthrough) and an active mode. The right column renders StepPanel (number + few-word title, chapters, progress n/N) in place of ExplainerPanel. App owns input while active: Up/Down step, PgUp/PgDn chapter, Home/End, Esc exit; child overlays render display-only. `/stepthrough off` also exits.

**Architecture**
App state: stepthrough { steps, index } | null. Reuses the existing overlay plumbing for the left pane via the resolver. Header/status show 'Step n/N — title'.

**Key decisions**

- Global input capture; overlays read-only in this mode.

**Alternatives considered**

- Text-only dump (rejected).

**Depends on**

- Session/App: stepthrough preview state (progressive rebuild)
- Step → screen resolver

**Acceptance criteria**

- Entering shows the list; Up/Down navigates and the left view follows; Esc restores the Explainer.

### FEAT-56 — Highlight primitives across existing views

- priority: high
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, highlight
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Optional highlight props driven by the step resolver: ParamEditorOverlay highlights a group+label (accent marker + colour); PatternView highlights a cell/row/order; MixerOverlay highlights a row; SamplesOverlay a slot; InstrumentsOverlay an instrument; PatternsOverlay an order. Distinct from cursor/selection; purely visual.

**Architecture**
Shared helper to test whether a param/list row/cell is highlighted. Scroll-follow keeps the highlight visible.

**Key decisions**

- One consistent accent.
- No state mutation.

**Alternatives considered**

- Animated highlights (rejected: noisy).

**Depends on**

- Core: BuildTarget, BuildStep model, buildSteps + applyBuildStep

**Acceptance criteria**

- Every view renders a supplied highlight, and highlighting changes no state.

### FEAT-55 — Session/App: stepthrough preview state (progressive rebuild)

- priority: critical
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, preview, state
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
Keep the live Session untouched. On /stepthrough, clone a BuildTarget from the live session (structuredClone of project/song/settings + mixer arrays). buildPreview(index) clones the base target, applies steps 0..index-1 via applyBuildStep, and returns it. App derives a previewState = { ...liveState, song, settings, project, channelVolume, channelMuted, masterVolume, masterFx } and passes it to the views via an optional state prop.

**Architecture**
Add optional `state` props to MixerOverlay/SamplesOverlay/InstrumentsOverlay/PatternsOverlay/ParamEditorOverlay (PatternView already takes state). Add optional settings/fx overrides to samplerGroups/spectralGroups/percussionGroups/masterFxGroups so editors render the grown settings. Waveforms fall back to the source when spectral is not yet enabled.

**Key decisions**

- No session mutation and no audio side effects.
- structuredClone the model (Maps are supported) for cheap snapshots.

**Alternatives considered**

- Mutate the real Session with engine suppression (rejected: riskier, waveform/audio drift, harder to restore).

**Open questions**

- Should stepthrough disable transport playback?

**Depends on**

- Core: BuildTarget, BuildStep model, buildSteps + applyBuildStep

**Acceptance criteria**

- Advancing steps grows the rendered project; retreating shrinks it.
- Leaving the mode restores the live session/Explainer exactly.

### FEAT-54 — Core: BuildTarget, BuildStep model, buildSteps + applyBuildStep

- priority: critical
- tags: stepthrough, tutorial, automation, tui, core, plan-stepthrough-mode-progressive-project-rebuild-tutorial, generator
- created: 2026-09-17
- updated: 2026-09-17
- plan: stepthrough-mode-progressive-project-rebuild-tutorial
- kind: card
- parent: FEAT-53

**Plan:** Stepthrough mode — progressive project rebuild tutorial _(#plan-stepthrough-mode-progressive-project-rebuild-tutorial)_

**Plan summary**
STEPTHROUGH MODE: read the loaded .lampjson + SongModel, synthesise an ordered BuildStep recipe of how the project is assembled, and present it as a navigable, progressively-rebuilding tutorial. The step list replaces the right-hand Explainer panel; Up/Down moves through steps; the main area shows the target screen (tracker, instrument tab, mixer, samples, patterns, song) with the step's parameters/cells highlighted. Progressive rebuild: navigating applies steps 1..N to a scratch clone of the project model so it visibly grows. Steps carry machine-readable actions so the same recipe can drive future automation. Core model is framework-agnostic.

**Approach**
New src/core/stepthrough.ts. BuildTarget = { project, song, settings, channelVolume, channelMuted, masterVolume, masterFx }. BuildStep = { id, title, detail, screen, instrument?, order?, highlights, action }. buildSteps(target) walks a canonical order and emits a step only where a value differs from the relevant default, so empty projects yield few steps. applyBuildStep(target, step) mutates a BuildTarget in place; pattern actions use applyEdit so timelines update. Pure: no Ink, no audio.

**Architecture**
Chapters: song meta/timing; source-sample names/comments; per instrument (name, source/loop/trim, ADSR, tune/level, pan/vibrato, polyphony, Spectral enable/mode/sourceB/params/mix/one-shot, Percussion); mixer; master FX; patterns (one step per non-empty channel/order/row); arrangement. Action kinds: songMeta, timing, sampleName, instrumentName, instrumentSource, instrumentParam, spectralParam, percussionParam, channelVolume, channelMute, masterVolume, masterFx, patternCell, orderPattern.

**Key decisions**

- Derive from final state + defaults (no edit history in .lampjson).
- Read-only model mutation only; never touches audio.
- Keep in core so a future script runner reuses applyBuildStep.

**Alternatives considered**

- Build event log stored in the project (works only for future projects; noted as a complement).

**Open questions**

- Group pattern rows per pattern for very long songs?

**Acceptance criteria**

- buildSteps is stable and ordered for the bundled project; skips defaults.
- applyBuildStep(step) reproduces each emitted value.
- Round-trip test: apply all steps to a default target equals the source target for the covered fields.

### FEAT-52 — Pattern Manager overlay: add/remove/duplicate/re-arrange orders

- priority: high
- tags: tui, patterns, pattern-manager, orders, tracker, reorder
- created: 2026-09-17
- updated: 2026-09-17

Parity with the 0008 Pattern Manager. Added `/patterns` (aliases `patternmanager`, `pm`) opening a PatternsOverlay listing order positions with their channel-0 pattern number and a `◀ view` marker. Keys: ↑↓ select, Shift+↑↓/J/K move the order up/down (re-arrange, swapping across every channel), a add empty, d duplicate, x/Delete remove, e edit the pattern number inline, c (twice) clear all, Enter jump the tracker there and close, Esc close. Added core helpers tracker.ts moveOrder/setOrderPattern and Session methods insertPatternAt/removePatternAt/moveOrder/setOrderPatternNumber (existing insertPattern/removePattern now delegate). Added `/move <up|down> [order]` and `/setpattern <order> <n>` commands for scripting; kept /insert, /remove, /clearall. Verified live in a pty (move down reorders 01↔12 and follows the view) and with new tests (session move/setpattern + overlay duplicate + /patterns command). typecheck clean, 177 tests pass.

### FEAT-51 — Rename /instrument to /setinstrument

- priority: low
- tags: tui, commands, rename
- created: 2026-09-17
- updated: 2026-09-17

Renamed the cursor-cell instrument command from `/instrument` to `/setinstrument` to avoid confusion with `/instruments`. Kept `ins` as an alias and added `setins`. Help/command listing updates automatically. Verified: typecheck clean, 173 tests pass, TUI builds.

### FEAT-50 — Instrument editor UX streamlining (tab status, mode cycling, conditional options)

- priority: medium
- tags: tui, instruments, spectral, percussion, sampler, ux, streamlining
- created: 2026-09-17
- updated: 2026-09-17

Instrument editor UX pass: (1) tab bar bolds/colours Spectral and Percussion green when their modes are enabled (Sampler stays neutral; active tab is inverse); (2) `[`/`]` now cycle the Sampler/Spectral/Percussion tabs for consistency, with `,`/`.` taking over instrument switching and hints updated; (3) Spectral hides the Source B selector + whole Source B group unless the selected fusion mode uses B, and the Mix group shows only the current algorithm's amount slider (Mix/Cross-Synth/Convolve/Ring-Modulate) plus Stereo width; (4) Percussion hides Noise/Transient/Pitch & amp/Body/Character groups until Percussion is enabled; (5) Sampler hides Ping-pong unless looping, Trim start/end unless a source is assigned, and Voice cap unless polyphonic. Verified live in a pty (tab attrs: active=reverse, Spectral=bold green, Percussion=dim) and via updated component tests.

### FEAT-49 — Select the source sample from the Spectral editor

- priority: medium
- tags: tui, spectral, source-sample, ux
- created: 2026-09-17
- updated: 2026-09-17

Added a "Source sample" selector to the Spectral editor's Source A group (previously only Source B was selectable there), so the sample to fuse can be chosen without leaving Spectral. It calls Session.updateSamplerSetting({ sourceIndex }) which re-trims/re-renders via the existing path. Verified by the spectral render test now asserting "Source sample".

### FEAT-48 — /instruments list menu with tabbed instrument editor

- priority: high
- tags: tui, instruments, menus, instruments-list, tabs, ux
- created: 2026-09-17
- updated: 2026-09-17

Added `/instruments` (alias `ilist`) opening a new InstrumentsOverlay: a scrollable list of index, name, sampler/spectral/percussion + source + mute. ↑↓ moves, Enter opens the Sampler tab, 1/2/3 open Sampler/Spectral/Percussion, m toggles mute, p previews, Esc closes. ParamEditorOverlay gained an optional tab bar (Sampler | Spectral | Percussion) switched by Tab/Shift+Tab or 1-3; Esc returns to the instrument list when the editor was opened from it. Reuses existing editor groups and `[`/`]` instrument switching. Verified live in a pty and by new component/command tests.

### FEAT-47 — New projects name source samples from their filenames

- priority: low
- tags: tui, samples, project, new, naming
- created: 2026-09-17
- updated: 2026-09-17

On `/new` (and when opening a bare `.fur`), empty source-sample slots are now named from their source file (basename without extension) instead of being blank. `bundledSamples()` now returns `{ bytes, names }` and a `withSampleNames()` helper fills only empty names, preserving any existing name/url/comments/dataUrl. Verified with a `/new` command test asserting `sampleNames` matches the bundled filenames.

### FEAT-46 — Rename /samples to /sourcesamples

- priority: low
- tags: tui, commands, rename, samples
- created: 2026-09-17
- updated: 2026-09-17

Renamed the source-sample browser slash command from /samples to /sourcesamples (id + name), keeping `samples` and `src` as aliases so existing typed commands and scripts still resolve.

### BUG-9 — Multi-line status broke Ink repainting (missing pattern rows)

- priority: high
- tags: tui, ink, rendering, statusbar, layout, bug
- created: 2026-09-17
- updated: 2026-09-17

Opening Source Samples (whose /samples command returned a multi-line message) pushed that message into Session.status, and StatusBar rendered every line. That made the whole layout taller than the terminal, so after exiting the overlay and while scrolling, Ink skipped repainting pattern rows (rows 02, 0B, 14, 1D… vanished even though the cursor moved to them). Fix: return a concise single-line status from /sourcesamples, and make StatusBar defensively collapse newlines and truncate to one line. Also sized the explainer panel to the full content height (was 2 rows short) and passed the available content width/height into SamplesOverlay so its waveform no longer wraps. Reproduced and verified with a pty + pyte terminal emulator: no missing rows after open → escape → scroll.

### FEAT-45 — Edit Source Sample name and info from Source Samples

- priority: medium
- tags: tui, sampler, samples, editing, project
- created: 2026-09-17
- updated: 2026-09-17

In Source Samples, Enter now opens an inline info editor for the highlighted slot (name + comments), matching the original app's "Source Sample N" modal. Field switching via ↑↓/Tab, Enter advances then saves from Comments, Esc cancels, and `p` previews. Added Session.sampleName/sampleComments/updateSampleInfo, persisting into sampleNames + ProjectFile.sourceSamples (preserving url/dataUrl) and marking the project dirty. Verified with an ink-testing-library interaction test (Enter → name → Enter → comments → Enter saves) and the full suite.

### FEAT-44 — Menu-aware top and bottom instructions

- priority: medium
- tags: tui, menus, layout, ux, statusbar
- created: 2026-09-17
- updated: 2026-09-17

When a menu/overlay is open, the persistent TUI chrome no longer shows tracker instructions. SongHeader's order strip (and its misleading "[ / ] cycle orders") is replaced by the active menu's title + controls, and StatusBar's hint switches to the same menu hint. Covers Help, Sampler/Spectral/Percussion/Master-FX editors, Mixer and Source Samples; the tracker hint returns when all menus close. Verified with an App render test that runs `/samples` and asserts the header shows "Source Samples" and not "cycle orders".

### FEAT-43 — Menu param editor: Enter types a value, Ctrl+←/→ coarse adjust

- priority: medium
- tags: tui, menus, keyboard, ux, parameters
- created: 2026-09-17
- updated: 2026-09-17

In ParamEditorOverlay: keep `p` as the preview key, repurpose Enter to open an inline value-entry buffer for the selected parameter (numbers parsed and clamped to min/max/integer, toggles accept on/off/true/false/1/0, enums accept a choice name case-insensitively or its numeric index; invalid input keeps the editor open). Ctrl+←/→ now adjusts numeric params by ×10 the normal step. Hints and explainer copy updated. Verified with parse/seed unit tests plus ink-testing-library interaction tests (Enter→type→Enter applies; Ctrl+arrows step by 10).

### FEAT-42 — Ctrl+Up/Down jumps to the next menu category

- priority: medium
- tags: tui, menus, keyboard, ux
- created: 2026-09-17
- updated: 2026-09-17

Ctrl+↑/↓ now jumps to the previous/next category: ParamEditorOverlay groups (Waveform, Source, Amp envelope, …), MixerOverlay groups (channels / master / delay / reverb), and HelpOverlay command sections. Plain arrows keep their one-row behaviour. Hints updated. Verified by typecheck + full 160-test suite.

### FEAT-41 — Explainer panel on the right-hand side of the terminal

- priority: high
- tags: tui, explainer, ux, layout
- created: 2026-09-17
- updated: 2026-09-17

Ported the 0008 explainer to `src/tui/explainer.ts` (cell/row/channel/patterns/instrument text, FX_CATALOG effect meaning) and added a persistent right-hand `ExplainerPanel`. Cursor drives the tracker explanation; ParamEditorOverlay, MixerOverlay and SamplesOverlay push the highlighted setting via an `onExplain` callback. Layout is now a horizontal row (main view + panel), shown at ≥84 terminal columns. Verified live in a pty (panel showed the note-off explanation for the cursor cell) and with new explainer unit tests.

### FEAT-40 — Highlight pattern cells by instrument (on by default)

- priority: high
- tags: tui, tracker, visualisation, instrument-colour
- created: 2026-09-17
- updated: 2026-09-17

Pattern cells are tinted by the held instrument's `colorRgb` (via channel.insTimeline, only while a note is held), using a darkened truecolor Ink background that approximates the original 0.18-alpha cell highlight; scaled brighter on the playhead row. Added `colorInstruments` session flag (default true) and `/colors on|off|toggle`. Cursor/selection still take precedence. Verified live in a pty: truecolor `48;2;…` backgrounds emitted; toggle tested in PatternView render tests.

### FEAT-39 — Remove chip mode and playback-mode switching entirely

- priority: high
- tags: tui, audio, cleanup, chip-mode
- created: 2026-09-17
- updated: 2026-09-17

Chip mode / sampler-vs-chip switching removed end to end: PlaybackMode + setMode/loadStems/stemsReady from the audio backend interface and WebAudioBackend; `mode`, `setMode`, `toggleMode`, `stemsAvailable`, `chipMix` from Session; `/mode` command; `[mode]` from SongHeader; `mode` from the session snapshot; `samplerModeEnabled` from the ProjectFile schema; stems/chipMix from LoadedSong, runtime/assets and tui/io. Export already used the sampler mixdown. Verified: typecheck clean, 160 tests pass (updated tui-commands, control transport.order, runtime-assets, core round-trip).

### FEAT-38 — [ / ] cycle orders from the main edit screen

- priority: medium
- tags: tui, tracker, keyboard
- created: 2026-09-17
- updated: 2026-09-17

Added `[` / `]` in tracker mode to move to the previous / next order, with an inline hint next to the header order strip (`order 00 01 02 03 04  [ / ] cycle orders`). Order movement now **cycles** (wrapping past the last order back to the first) for both `[`/`]` and PgUp/PgDn, while Shift+PgUp/PgDn still clamps for selection extension. Documented in the `?` help `keys (edit mode)` section. Verified live via the control socket (0→1→2→1→0) and a unit test covering the wrap boundary.

### FEAT-37 — One-shot option in Perc / Drum mode

- priority: medium
- tags: tui, percussion, spectral, parity
- created: 2026-09-17
- updated: 2026-09-17

The original percussion controls expose **One-shot (don't loop)** bound to `spectral.oneShot`, forced on when percussion is enabled or a preset is applied. `percussionGroups` now mirrors that: added the toggle, and enabling percussion / applying a preset sets `oneShot = true`. Component test asserts the control renders.

### BUG-8 — Slash-command suggestion popup clipped a line

- priority: high
- tags: tui, commands, layout
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** the slash-command suggestion popup had a missing line.

**Cause:** the tracker viewport was sized `rows - 11` regardless of how many suggestion rows the palette added, so with the popup open the layout overflowed the terminal and Ink clipped a row.

**Fix:** suggestions are capped to `min(8, rows - 11)` and the tracker viewport is now `max(3, rows - 8 - suggestions.length)`, so the popup always fits. Verified live: the final frame shows all 8 suggestion rows plus the input line with no clipping.

### BUG-7 — Ctrl+Space did not play from the selected cell

- priority: high
- tags: tui, tracker, keyboard
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** Ctrl+Space didn't play from the selected cell.

**Cause:** terminals send NUL (0x00) for Ctrl+Space, and Ink's key parser maps `\x00` through its ctrl+letter branch (`name = charCode + 96`), so it arrives as `` ` `` with `key.ctrl = true` — never as a space or NUL char.

**Fix:** App now treats `key.ctrl && (char === " " || char === "\`")`as Ctrl+Space and calls`Session.playFromCursor()`. Verified via the control socket: cursor at row 8 → playing true, clock at 2.1s (i.e. started from row 8). Unit test added.

### FEAT-36 — Ctrl+arrow jumps, cross-pattern row wrap, and full EDIT MODE key parity

- priority: high
- tags: tui, tracker, keyboard, parity
- created: 2026-09-17
- updated: 2026-09-17

Implemented the original app's EDIT MODE shortcuts (from `0008/src/renderer/components/PatternGrid.tsx` help menu):

- Arrows move selection; rows now **wrap across pattern/order boundaries** (past the last row → next order, before the first → previous order).
- **Ctrl+Up/Down** = move 16 rows; **Ctrl+Left/Right** = jump channel (NOTE column).
- **Shift+arrows** extend selection; **PgUp/PgDn** move order.
- **Z** last value, **X** clear cell/range, **C** note off, **Q/A** value ±1, **W/S** note ±1 octave (all operate on the selection).
- **Ctrl+C/X/V** copy/cut/paste, **Ctrl+Shift+V** flood paste, **Ctrl+A** select column / all, **Ctrl+Z/Y** undo/redo, **Space** play from pattern start, **Ctrl+Space** play from the selected cell.
- Note entry moved to **uppercase letters** (Z S X D C V G B H N J M) since lowercase z/x/c/q/a/w/s are the original edit keys; non-conflicting lowercase note keys (d/v/g/b/h/n/j/m/l) still work.

Right-click context menus are the GUI equivalent and remain commands/editors in the TUI. Added a `keys (edit mode)` section to `?` help listing all of the above. Verified live: Ctrl+↓×4 → `order 1 row 0`, Ctrl+↑×4 back, PgDn clamps.

### BUG-6 — Editing turned off playhead follow mode

- priority: high
- tags: tui, tracker, playback, ux
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** editing turned follow off.

**Cause:** `moveCursor`/`setCursor` explicitly disabled `follow`, and `editCell` advances the cursor via `moveCursor`, so every note entry or cursor move killed follow. Follow also moved the _cursor_ rather than the view.

**Fix:** follow now scrolls the **view** only — `refreshPlayhead` updates `viewOrder` + a new `viewRow` (the row PatternView scrolls to) and keeps the edit cursor in the playing order, but never moves the cursor row. No navigation or edit path disables follow any more. Test asserts follow stays true while navigating, `setCursor`-ing and entering a note.

### FEAT-35 — Beat / bar markers in the pattern view

- priority: medium
- tags: tui, tracker, ux, visualisation
- created: 2026-09-17
- updated: 2026-09-17

Pattern rows now show musical structure from the song's `highlightA` (beat) and `highlightB` (bar): a `●` marker and a light grey row highlight on bar rows, a `·` marker and cyan row number on other beats, and a dim row number elsewhere — all within the existing 4-column row-number gutter, so alignment is unchanged. Verified live: `●00` bar, `·04/·08/·0C` beats.

### BUG-5 — Overlay pagination sized to the whole terminal, clipping rows while scrolling

- priority: high
- tags: tui, help, ux, layout
- created: 2026-09-17
- updated: 2026-09-17

**Reported (follow-up to BUG-4):** scrolling the help loses a line, and rows entering that line are missing.

**Cause:** `HelpOverlay` paginated against the full terminal `rows` even though it renders inside the middle region (below the 3-row header and above the status/command bar), so the box overflowed and Ink clipped a row. Header `marginTop` also added unbudgeted rows.

**Fix:** App now passes `viewportRows` (`rows - chrome`) as `height`; help uses `pageSize = height - 4` with one terminal row per entry (explicit spacer lines instead of margins) and the range folded into the hint. The same height-aware scrolling was added to `ParamEditorOverlay` (row-based window that keeps the selected param visible). Verified in a pty: help `1–9 of 65` → `3–11 of 65`, sampler `1-10` → `21-30`.

### FEAT-34 — Enter autocompletes an unfinished slash command

- priority: medium
- tags: tui, commands, autocomplete
- created: 2026-09-17
- updated: 2026-09-17

**Reported request:** pressing Enter before finishing a slash command should autocomplete it, just like Tab.

**Fix:** `CommandRegistry.enterAction(input, hasSuggestions)` returns `complete` while the first token is not an exact command name and a suggestion exists, else `run`. The command bar applies the suggestion on Enter in the former case and executes in the latter. Unit tested for `/inf`, `/`, `/info`, `/info song` and unknown input.

### FEAT-33 — Waveform previews in the Sampler, Sample and Spectral menus

- priority: medium
- tags: tui, sampler, spectral, waveform, ux
- created: 2026-09-17
- updated: 2026-09-17

Added block-character waveform previews at the top of the Sampler editor (effective clip, or source-sample fallback), the Spectral editor (fused render when available, else source) and the Percussion editor (rendered hit). The existing Samples overlay waveform is retained. `Session.effectiveWaveform`/`fusionWaveform` expose the backend data; App ticks the editors every 300ms so previews refresh after a re-render. Covered by component tests asserting the Waveform groups render.

### BUG-4 — /help does not show all commands (no scrolling)

- priority: medium
- tags: tui, help, ux
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** `/help` doesn't show all commands.

**Cause:** `HelpOverlay` rendered the whole catalogue with no scrolling, so the terminal clipped it.

**Fix:** the overlay now builds a flat line list (headers + commands), shows a `rows - 5` page, scrolls with ↑↓/j/k and space/PgUp/PgDn, and shows a `x–y of N` range with the command count in the title. It owns its own `useInput` (App's global handler is inactive while help is open) and truncates long descriptions. Component test asserts the full command count and range indicator.

### BUG-3 — Down arrow selects an invisible item in some menus (empty-list off-by-one)

- priority: high
- tags: tui, ux, selection
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** in a few menus, pressing Down moves the selection to an invisible item.

**Cause:** every down-handler clamped only the upper bound (`Math.min(len - 1, i + 1)`); when the list was empty (e.g. a command palette after completing a command with no arg completions, or an editor with no params) this produced `-1`, so the highlight vanished.

**Fix:** clamp both ends (`Math.max(0, Math.min(len - 1, i + 1))`) and guard empty lists in `ParamEditorOverlay`, `MixerOverlay`, `SamplesOverlay` and the App command palette; reset the palette selection to 0 whenever suggestions become empty. Also stopped blank enum values rendering as empty (`-` fallback).

### BUG-2 — Tracker view does not follow the playhead

- priority: high
- tags: tui, tracker, playback, ux
- created: 2026-09-17
- updated: 2026-09-17

**Reported:** the pattern viewer does not follow the playhead during playback.

**Fix:** added `SessionState.follow` (default on) and `Session.setFollow`; `refreshPlayhead` now moves the cursor (and thus the viewport/order) to `songPositionAt(time)` while playing when follow is on. Manual navigation and `setCursor` release follow so the user can browse while playing; `/follow on|off|toggle` (and the GUI's old behaviour) re-enables it. Covered by tests asserting the cursor advances with the playhead and that navigation releases follow.

### FEAT-32 — Deferred: scripting & live control channel (`.lmpscript`, agent automation)

- priority: low
- tags: deferred, scripting, automation, control-socket, agents, lmpscript
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Status:** deliberately deferred by John (2026-09-17). Not in scope for the Core milestone. Captured so the command engine is built script-ready (FEAT-22) and the work is ready to schedule later.

**Goal (when picked up)**
Make every action automatable: users or agents run `.lmpscript` files / commands and get live feedback to test the program while it runs. Decided direction when last discussed: a **live control channel that agents attach to the running TUI**, rather than a separate headless mode.

**Carry-over decisions already made**

- Commands are the single source of action; a script/agent drives the same registry the TUI uses (FEAT-22).
- `.lmpscript` is a sequence of commands with optional leading `/`, comments, variables/interpolation, waits and assertions.
- Read/query commands plus an event stream provide feedback, not just fire-and-forget mutation.
- Live feedback means attaching to the interactive app; transport/position/meter/render events are observable.

**Open questions for later**

- Transport: Unix domain socket + newline-delimited JSON (recommended, named pipe on Windows), vs TCP+token, vs WebSocket.
- Protocol: request/response + event subscription shape; command ids, arg schema, result payloads; protocol versioning.
- Script control flow in v1 (variables/assert/wait/loops) vs a minimal command list.
- Security/sandbox: who may connect, fs write scope, dry-run.
- Whether a headless `-c`/`--script` runner is also needed for CI, or the socket is the only host.
- How `.lmpscript` scenario files become the E2E test format (superseding Playwright DOM tests; see FEAT-29).

**Depends on**

- FEAT-22 (scriptable command engine)
- FEAT-21 (TUI shell) and FEAT-24 (playback/transport commands)

**Acceptance criteria**

- (Placeholder — define when scheduled.)

**Completed (2026-09-17)**
`src/control/server.ts` runs a local Unix socket (named pipe on Windows, 0600) speaking NDJSON; `ControlClient` drives it; `src/control/script.ts` runs `.lmpscript` files (commands + `@let/@query/@wait/@assert/@subscribe/@echo/@exit`, `$var` interpolation, `-> $var` capture) and `src/control/runScript.ts` is the `lantern-run` CLI (`--json` NDJSON for agents). Added `/query <path>` (structured state), `/socket`, and transport/tracker/mixer/status/samples/meters events. Disable with `LANTERN_CONTROL=0`; override the path with `LANTERN_SOCKET`. Verified by `tests/unit/control.test.ts` and a live E2E against the built app (`examples/control-smoke.lmpscript`, PASSED 13/0).

### FEAT-31 — Deferred parity: graph editors (sampler, spectral/percussion, master FX graphs, cover art)

- priority: low
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, parity, deferred, spectral, cover-art
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Follow-up epic after Core scope ships: bring the remaining GUI editors to the TUI. Each becomes a set of slash commands plus a non-modal overlay using text/braille plots instead of canvas. Covers: SamplerEditor (ADSR/loop/sample params), Spectral modulation + percussion controls incl. FEAT-16 auto-preview-on-slider-release, Master FX graphical response, Cover Art editor (needs a new TUI interaction model or headless export only).

**Architecture**
New overlays under src/tui/components/ reusing src/core/sampler.ts, spectral.ts, masterFx.ts, and backend methods. Text plotting helper (braille line/bar) shared. Cover art: decide between headless authoring (JSON + command editing), sixel/kitty preview, or cancellation.

**Key decisions**

- Parity is additive; Core milestone must not block on it.
- No canvas — text/braille only.
- FEAT-16's slider-release preview maps to a command arg commit or an explicit /preview.

**Alternatives considered**

- Never port editors: possible if Core scope proves sufficient; decided after user trial.
- Keep GUI for editors alongside TUI: rejected by replacement decision.

**Open questions**

- Is text/braille expressive enough for ADSR/envelope editing, or do we need an interactive numeric editor only?
- Cover art: headless-only vs image protocol vs drop?

**Depends on**

- FEAT cleanup

**Acceptance criteria**

- (Placeholder — define scope after Core milestone user feedback.)

**Completed (2026-09-17)**
`ParamEditorOverlay.tsx` is a reusable keyboard-driven editor (↑↓ select, ←→ adjust, enter/p preview, `[`/`]` instrument, esc close) fed by `src/tui/editors.tsx`: sampler (source/trim/ADSR + envelope sparkline/tuning/vibrato/polyphony), spectral (enable/mode/sources/mix), percussion (presets + noise/transient/pitch/body/character), and master FX (delay+reverb). `/sampler`, `/spectral`, `/percussion`, `/fx` open them. `Session.updateSamplerSetting` mirrors the GUI's re-render/re-trim logic and `Session.previewAfterRender` is the FEAT-16 preview-on-adjust (350ms debounce). Cover art is now headless: `src/core/coverArt.ts` ports the procedural 32×32+4×4-Bayer scene, `src/runtime/cover.ts` adds a zlib PNG encoder, and `/export png` (plus WAV artwork embedding) uses it. Remaining out of scope: the FEAT-15 mecha/power-suit _part designer_ (archived) and interactive modulation-route editing (routes are shown read-only; author via project JSON).

### FEAT-30 — Retire Electron + React DOM (cleanup)

- priority: medium
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, cleanup, electron-removal, react
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Once the TUI passes Core-scope acceptance and packaging builds, delete the obsolete GUI surface: src/main, src/preload, src/renderer (except assets that are reused, e.g. Medodica font if needed and vendor/prism as a wasm source), React DOM components, styles.css, index.html, Vite configs, Playwright web config and web/E2E tests that targeted the DOM. Update KANBAN cards and scripts. Do this last so the GUI can still be run for comparison during migration.

**Architecture**
Remove files and dependencies (electron, react-dom, vite, @vitejs/plugin-react, playwright web config). Keep react (Ink uses it), typescript, esbuild, vitest, @types. Move src/renderer/vendor/prism/prism_wasm_bg.wasm to a runtime wasm asset path. Re-point FEAT-15 (cover art) to a TUI-appropriate future design.

**Key decisions**

- Delete rather than archive, history retains the GUI in git.
- Preserve MEDODICA? No — TUI uses the terminal font; drop the OTF asset.
- Keep src/core, src/audio, src/wasm (Node-hosted), src/shared (trimmed), src/runtime, src/tui.

**Alternatives considered**

- Keep the GUI in-tree: rejected by the 'replace entirely' decision.

**Open questions**

- Should the old GUI be taggged/released before deletion for reference?
- Does FEAT-15 cover art get cancelled or rewritten for a sixel/kitty header?

**Depends on**

- FEAT packaging
- FEAT test strategy

**Acceptance criteria**

- No electron/react-dom/vite dependencies or entrypoints remain.
- Build and full test suite still pass after deletion.
- README/scripts describe the TUI-only workflow and `lantern` command.

**Comments**

- Update FEAT-15: cover-art editor's 240x240 dithered PNG output can still be exported headlessly, but its React editor UI must be redesigned for the TUI or dropped.

**Completed (2026-09-17)**
Removed `src/main`, `src/preload`, `src/renderer`, `src/shared/ipc.ts`, Vite/Playwright configs, DOM E2E/web tests, and the Electron/Vite build scripts. Moved the vendored prism glue to `src/wasm/vendor/prism/`. `package.json` now ships only ink / node-web-audio-api / react (+ esbuild, vitest, ink-testing-library, typescript). tsconfigs trimmed to the TUI surface. `npm run dev:tui` and the `lantern` bin remain; full test suite and build pass.

### FEAT-29 — Test strategy: port core tests, add headless TUI + audio regression

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, tests, vitest, headless, regression
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Keep all src/core unit tests running unchanged under Node (they are already environment-free). Add: (a) pure unit tests for the fuzzy matcher, command registry and each builtin handler with a mock CommandContext; (b) Ink component tests rendering to a string via ink-testing-library to assert the persistent layout, suggestion list and Tab completion; (c) a Node audio smoke/regression test that renders a fixed project offline and compares against a captured golden PCM; (d) a worker/WASM regression reusing tests/unit/prism-*.test.ts with the Node worker host.

**Architecture**
New tests/tui/*.test.tsx (ink-testing-library), tests/unit/commands.test.ts, tests/unit/fuzzy.test.ts, tests/unit/runtime-assets.test.ts, tests/unit/audio-node.test.ts. Update vitest.config.mts environment per-file (node default; jsdom only where still needed, ideally none). Capture golden PCM/WAV fixtures under tests/fixtures/golden/.

**Key decisions**

- Core tests must pass untouched — strongest evidence the migration preserved behavior.
- TUI logic is tested through pure command handlers + string-rendered components, not a real terminal.
- Audio golden tests use a fixed sample rate and a documented float tolerance.

**Alternatives considered**

- Snapshot-test the whole TUI: brittle; assert targeted regions instead.
- Manually verify audio: rejected — regressions in the DSP would be silent.

**Open questions**

- What tolerance is acceptable for the node-web-audio-api offline render vs the previous browser output?
- Future (once FEAT-32 scripting lands): should `.lmpscript` scenario files replace the string-rendered Ink component tests as the primary integration/E2E layer? Design command handlers so they can also be invoked from such a runner.

**Depends on**

- FEAT audio shim
- FEAT worker host
- FEAT slash-command engine

**Acceptance criteria**

- `npm test` runs the full migrated core suite plus new TUI/runtime tests green under Node.
- A deliberately broken fuzzy score or command handler fails the suite.
- The audio golden test fails if the offline render changes beyond tolerance.

**Completed (2026-09-17)**
18 test files / 127 tests green under Node; core tests untouched. Added `ink-testing-library` component tests (`tui-components.test.tsx`), tracker/IO tests (`tui-tracker-ops.test.ts`), worker-handler tests, and a golden-PCM regression (`audio-golden.test.ts` + `tests/fixtures/golden/master-fx-delay.json`, regenerate with `UPDATE_GOLDEN=1`).

### FEAT-27 — Commands: source samples and sampler browse + preview

- priority: medium
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, sampler, commands, preview
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Provide /samples (list source samples with names, durations, fused state), /sample <n> [path] (load/replace), /preview <n> and /waveform <n> (ASCII waveform), plus /instrument <n> for per-instrument effective clip info. Reuse backend.sampleWaveform, effectiveWaveform, preview, sampleClip and the SourceSamples UI data. The heavyweight Sampler/Spectral editors stay deferred.

**Architecture**
src/tui/components/SampleListOverlay.tsx and a text Waveform component (braille/block chars). Commands in builtins.ts route to backend methods already in AudioBackend. Sample names come from the existing settings/sampleNames state.

**Key decisions**

- Browse/preview only in milestone 1; parameter editing deferred.
- ASCII/braille waveform, no image protocol.
- All values read from the backend interface, no new DSP.

**Alternatives considered**

- Port the full SamplerEditor now: deferred by scope decision.

**Open questions**

- Braille vs block characters for the waveform given font support?
- Should /sample with no path clear the slot (mirrors GUI 'Clear Source Samples')?

**Depends on**

- FEAT audio shim
- FEAT slash-command engine

**Acceptance criteria**

- /samples lists all 6 bundled source samples with durations.
- /sample n <path> replaces a sample and updates the waveform and preview.
- /preview n auditions the rendered one-shot without leaving the tracker view.
- Unit tests cover the sample-list command handlers against a mock backend.

**Completed (2026-09-17)**
`/samples` and `/mixer` open non-modal overlays. `SamplesOverlay.tsx` lists the six samples with durations, renders a block-character waveform for the selection, previews with `p`/Enter, and lists instruments with their source/spectral assignment. Command coverage verified by tests.

### FEAT-26 — Commands: file, project and export IO with path completion

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, io, project, export, commands, completion
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Replace Electron dialogs with commands that take paths and use a filesystem path completer for Tab. Commands: /open <file.fur|.lampjson> /save [path] /saveas /export wav|mid|zip|png|fur [path] /new /loadsamples /sample <n> <path> /info. Load paths reuse the existing core parse/serialize and buildSamplerSequence paths from App.tsx; export reuses src/core/export.ts (WAV/MIDI/ZIP) and CoverArt PNG path. Show a blocking progress indicator in the status line for long renders.

**Architecture**
src/runtime/files.ts (fs read/write, filter by extension). src/tui/commands/completers.ts (async directory listing with prefix filter, ~ expansion, relative-to-cwd and quoted paths). src/tui/state/projectStore.ts mirrors App.tsx project load/save/dirty logic incl. legacy .lampjson handling. Reuse export functions unchanged.

**Key decisions**

- No file picker in v1: typed/quoted paths with Tab completion.
- Overwriting an existing file prompts in the status line (y/n) unless --force.
- Exports are synchronous-or-promise with a status progress line; no modal dialog.

**Alternatives considered**

- Embed a TUI file browser overlay: deferred; path completion is faster for keyboard users.
- Keep Electron dialogs: rejected.

**Open questions**

- Where do exports default to when no path is given (cwd, source dir, or a configured export dir)?
- Should recent files be persisted and offered by fuzzy completion?

**Depends on**

- FEAT de-electron-ify
- FEAT slash-command engine
- FEAT tui shell

**Acceptance criteria**

- /open loads a .fur, a .lampjson and a project-only .lampjson with the same results as the GUI E2E fixtures.
- /export wav produces a file byte-comparable (within documented tolerance) to the GUI export for a fixed project.
- Tab completes directory and file paths including nested directories and quoted paths with spaces.
- Failures (missing file, bad parse) surface as status errors and leave the current song loaded.

**Completed (2026-09-17)**
`src/tui/io.ts` implements `/open` (.lampjson with embedded or bundled samples; .fur via `parseFurFile` + default project), `/new`, `/save`, and `/export wav|mid|zip|fur` (loops/fade/normalize flags; WAV runs the Master FX offline). Async path completion is wired for path args. `/export png` stays with the deferred cover-art work (FEAT-31).

### FEAT-25 — Commands: mixer, master FX and channel settings overlay

- priority: medium
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, mixer, master-fx, commands
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Port the Mixer and Master FX to a keyboard-driven overlay reachable via /mixer and /masterfx, with numeric entry and arrow adjustments, plus commands /gain /pan (if present) /mastervol. Reuse MasterFxSettings and defaultMasterFx() from src/core/masterFx.ts and backend.setMasterFx. Graphs (ADSR, waveform) are out of milestone 1; show numbers and text meters instead.

**Architecture**
src/tui/components/MixerOverlay.tsx, MasterFxOverlay.tsx. Commands route to backend.setChannelVolume/setChannelMute/setMasterVolume/setMasterFx. State stays in the shared playback store so the header reflects changes.

**Key decisions**

- Overlay leaves header/command bar visible (non-modal).
- Values edited numerically and by +/- keys; no mouse.
- Visual graphs deferred; text bars for levels.

**Alternatives considered**

- Full-screen mixer: rejected to preserve the persistent tracker.
- Skip mixer in milestone 1: rejected — user selected mixer/transport in Core scope.

**Open questions**

- Should meter levels animate in the overlay, and at what refresh rate to avoid render churn?

**Depends on**

- FEAT tui shell
- FEAT transport commands

**Acceptance criteria**

- Changing a channel gain/mute or master FX applies live and survives overlay close.
- Values match the existing default/clamp rules in core/masterFx.ts.
- Unit tests cover command→setting mapping and clamping.

**Completed (2026-09-17)**
`/mixer` opens `MixerOverlay.tsx`: per-channel volume bars with peak meters, mute toggles, master volume, and delay/reverb enable+mix. Keyboard-driven (↑↓ select, ←→ adjust, m toggle, esc close); commands `/mute /unmute /volume /mastervol /meters` remain. Deep FX params (delay time/feedback, reverb decay) are only reachable by editing the project JSON for now.

### FEAT-23 — Commands: tracker navigation and editing

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, tracker, commands
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Expose the existing tracker edit operations (src/core/tracker.ts) through commands and direct grid editing. The persistent PatternView renders channels×rows with note/ins/vol/fx columns; the cursor is (channel, order, row, column). Note entry works like the GUI: type note keys (piano layout), digits for hex, Del to clear, clipboard via system clipboard or an in-app register. Reuse applyEdit/PatternSnapshot, undo/redo, and the existing CLIPBOARD_TAG format.

**Architecture**
src/tui/components/PatternView.tsx renders from SongModel patterns plus a cursor/selection store. src/tui/state/trackerStore.ts wraps EditColumn/CellPos selection, undo/redo stacks, and calls core/tracker applyEdit. Commands: /goto order row, /channel n, /order add|remove|move, /select, /copy, /paste, /undo, /redo, /clear, /transpose, /octave n, /step n. Follow-playhead option toggled by /follow.

**Key decisions**

- Reuse src/core/tracker.ts helpers verbatim (columnLabel, flatColumnsForChannel, applyEdit, clipboard encode/decode) so semantics match the GUI.
- Hex note entry layout mirrors the GUI exactly to avoid muscle-memory breakage.
- Selection + clipboard implemented in-terminal (no OS clipboard dependency).

**Alternatives considered**

- Readline-style text editing of a line: rejected — not a tracker.
- Third-party hex editor: rejected — must stay tied to SongModel semantics.

**Open questions**

- Multi-channel selection granularity (per-column vs per-cell block)?
- Should the order list be its own editable pane in milestone 1 or later?

**Depends on**

- FEAT tui shell
- FEAT slash-command engine

**Acceptance criteria**

- Cursor moves by keyboard across channels/orders/rows/columns; viewport scrolls to keep it visible.
- Editing a cell updates the pattern, marks the project dirty, and is reflected in playback after the existing re-sequence path.
- Undo/redo and copy/paste work across orders, with tests asserting round-trip through the CLIPBOARD_TAG format.
- basic-tracker-edit sequences produce identical SongModel changes to the GUI unit tests.

**Completed (2026-09-17)**
`src/tui/session.ts` now supports row/column/channel/order navigation, note + instrument entry, `q`/`a` value adjust, `/clear`, undo/redo (grouped history), Shift+arrow block selection with blue highlight, in-app `CLIPBOARD_TAG` copy/cut/paste (--flood), transpose, interpolate, insert/remove order, clear-all, `/lastvalue`, and configurable `/step`. All verified in `tui-tracker-ops.test.ts`.

### FEAT-20 — WASM + worker host: run prism DSP under Node worker_threads

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, wasm, worker-threads, prism
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Replace the browser Web Worker with a node:worker_threads host while keeping the worker protocol messages identical. src/wasm/prism.ts loading of prism_wasm_bg.wasm stays the same via WebAssembly.instantiate from the bundled file bytes. Choose worker_threads for parity with the existing async render lifecycle (fusionRendering/fusionReady polling).

**Architecture**
New src/wasm/prismWorkerHost.node.ts (or make prismWorkerClient detect environment and construct a Worker from node:worker_threads using a .cjs/.mjs entry compiled by esbuild). Worker entry prism.worker.ts compiled for Node with the wasm path resolved via a runtime asset resolver. Keep prismWorkerProtocol.ts unchanged.

**Key decisions**

- Preserve the existing protocol and render lifecycle so core/spectral consumers do not change.
- Ship the .wasm as a resolved asset (same file as src/renderer/vendor/prism/prism_wasm_bg.wasm) rather than importing it as a Vite URL.
- Support a synchronous in-process fallback for tests.

**Alternatives considered**

- Run WASM on the main thread: rejected — modulation/percussion renders would jank the UI loop.
- child_process: rejected — heavier, no structured-clone/SharedArrayBuffer ergonomics.

**Open questions**

- Can we reuse the already-built wasm32-unknown-unknown artifact from native/prism-wasm? (yes, but confirm the build script's output path).

**Depends on**

- FEAT audio shim

**Acceptance criteria**

- Unit test renders a modulated loop through the Node worker and compares against the golden fixture.
- fusionRendering/fusionReady/takeFusionCompleted behave as before.
- No Web Worker global is referenced in the Node path.

**Completed (2026-09-17)**
`src/wasm/prism.worker.node.ts` is a `worker_threads` entry built to `dist/tui/prism-worker.mjs`; `src/wasm/prismNode.ts` starts it, adapts it to `WorkerLike`, pings it, and registers it via `registerPrismWasmWorker`, falling back to synchronous in-process `initSync` when the worker bundle is absent (tests/dev). The shared `handlePrismRequest` is unit-tested. Verified the built worker answers a ping.

### FEAT-28 — Packaging: single `lantern` bin, build pipeline, drop Electron/Vite

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, build, packaging, esbuild
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Add a TUI build to scripts/build.mjs (esbuild) producing a Node CJS/ESM bundle plus the worker entry and copying assets. Add package.json bin (`lantern`) so `npx`/global install runs the app. Remove Electron from dependencies and delete Vite/React-DOM/web build scripts once the TUI reaches parity for Core scope. Keep the wasm build/vendor scripts (vendor:prism-dsp, build:prism-wasm) intact.

**Architecture**
scripts/build-tui.mjs: esbuild entry src/tui/main.tsx → dist/tui/main.cjs (node platform, external: node-* builtins + node-web-audio-api native), second entry for the worker, copy assets + wasm. package.json: "bin": {"lantern": "dist/tui/main.cjs"}, scripts dev:tui/start:tui/test:tui. tsconfig.node.json updated. Remove electron, vite, @vitejs/plugin-react, react-dom, playwright web config after the cleanup card.

**Key decisions**

- Node >= 22 (matches @types/node).
- Bundle the TUI but leave the audio native binding external.
- Keep vitest for unit tests; Playwright DOM E2E is removed with the GUI.

**Alternatives considered**

- tsx at runtime: fine for dev, not for distribution; use esbuild for the shipped bin.
- pkg/SEA single executable: nice-to-have later, not milestone 1.

**Open questions**

- Do we need prebuilds of node-web-audio-api for each platform, or rely on its prebuilt binaries?
- Should the bin auto-detect no-TTY (e.g. piped) and refuse to start?

**Depends on**

- FEAT tui shell
- FEAT audio shim
- FEAT worker host

**Acceptance criteria**

- `npm run build:tui && ./dist/tui/main.cjs` starts the app from a clean checkout with assets and wasm resolved.
- `npm link` exposes a working `lantern` command.
- No electron/vite/react-dom imports remain in the shipped bundles.

**Implementation (2026-09-17)**
Added `scripts/build-tui.mjs` (esbuild ESM bundle to `dist/tui/main.mjs`, copies `assets/` and `prism_wasm_bg.wasm` beside it), `bin.lantern`, and `build:tui` / `dev:tui` / `start:tui` scripts. Ink/React/`node-web-audio-api`/`react-devtools-core` stay external so Ink's optional devtools import resolves normally and React is single-instance. Electron/Vite removal is FEAT-30.

### FEAT-24 — Commands: transport, playback and song info

- priority: high
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, playback, transport, commands
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Wire AudioBackend playback into the TUI: /play /pause /stop /seek mm:ss|row /mode chip|sampler /volume /mute /solo /follow, plus an animated position/row readout in the header. Reuse the existing timing (rowTimes/rowTicks) for row<->time mapping. Playhead highlight in PatternView follows the active order/row.

**Architecture**
src/tui/state/playbackStore.ts drives backend.play/seek/currentTime plus the existing useAnimationFrame-equivalent poll (setInterval / Ink useInterval) to update the position line. Commands call backend methods and update channel/mute/master state exactly as App.tsx does today. Status toasts replace the GUI status string.

**Key decisions**

- Backend interface unchanged; TUI is a new consumer.
- Position display shows both elapsed/total time and current order:row.
- Mode switch chip/sampler preserved; chip mode uses the bundled chip mix.

**Alternatives considered**

- Poll via requestAnimationFrame: unavailable/inefficient in Node; use a bounded timer (e.g. 30–60 fps).

**Open questions**

- Should the transport act while an overlay (mixer) is open?
- Loop/seek granularity: row, order, or seconds?

**Depends on**

- FEAT audio shim
- FEAT tracker commands

**Acceptance criteria**

- /play starts audio; the header position advances; the pattern playhead highlights the correct order:row.
- Pause/resume/stop/seek behave as in the GUI and never desync the displayed row.
- Channel mute/solo and master volume are reflected in meterLevels and are reversible.

**Implementation (2026-09-17)**
Transport is in `src/tui/session.ts` and exposed via `/play /pause /stop /toggle /seek /mode /reference`, plus the playhead highlighted in the pattern view and a live `mm:ss / mm:ss` header clock. Verified by a unit test that plays through the Node backend and asserts the clock advances.

### FEAT-22 — Slash-command engine: registry, fuzzy match, suggestions, Tab completion

- priority: critical
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, commands, fuzzy, autocomplete
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Build a command framework independent of Ink: a registry of command definitions with name, aliases, description, category, args (with completers), and a handler operating on app state. A pure fuzzy scorer ranks commands and arg values. The Ink CommandBar renders the top N suggestions with matched-character highlighting; Tab accepts the highlighted completion, Up/Down move selection, Enter executes, Esc cancels. Completers are async-capable (file paths, instrument names, channel ids).

**Architecture**
New src/tui/commands/registry.ts (CommandDef, CommandContext, register/resolve), src/tui/commands/fuzzy.ts (pure score+rank, unit-testable), src/tui/commands/builtins.ts (all built-in commands), src/tui/components/CommandBar.tsx, src/tui/components/Suggestions.tsx. All commands operate on a CommandContext exposing song/project/backend/playback state and setters, so commands are testable headlessly. Slash is also the default mode (typing / focuses the bar).

**Key decisions**

- Fuzzy match: subsequence scoring with bonuses for prefix, word-boundary and camelCase matches; deterministic tie-break by name.
- Tab completes the selected suggestion; repeated Tab cycles; Tab on an arg completes arg values.
- Command grammar: `/name arg1 arg2 --flag value`; unknown command shows a did-you-mean from the fuzzy list.
- Every GUI action gets a command; keybindings are shortcuts for commands, not a parallel code path.
- All commands are pure functions over CommandContext so they can be tested without a terminal.
- Scriptable-by-design (deferred build): commands must not depend on Ink, the TUI store or terminal height. Each command declares stable id/args/result and returns a typed, JSON-serialisable result; human formatting is a separate layer. This lets a future `.lmpscript` runner or agent control channel drive the identical registry with zero refactor (see FEAT-32).

**Scriptability requirements (design-only; wiring is FEAT-32)**

- Session factory: build the CommandContext from a plain object (song/project/backend/playback/settings) so a non-UI host can construct a session. The TUI and any future runner must use the same factory.
- Typed results: `CommandResult<T> = { ok: true; data?: T; message?: string } | { ok: false; error: string }`. Every handler returns this; nothing returns only a display string.
- Stable command ids + declared arg schema (name/type/required/completer) so a script can enumerate commands and validate calls.
- Side effects confined to explicit CommandContext methods (backend playback, fs writes) so a runner can audit, dry-run or log them.
- Read/query commands included from the start (e.g. song info, transport position, pattern cell, meter levels) so automation and feedback can observe state, not just mutate it.

**Alternatives considered**

- : command prefix like vim: rejected — user asked for slash commands.
- Command menu-only browsing with no typing: rejected — user asked for fuzzy typing + Tab.
- Embed a third-party CLI framework (commander/yargs): rejected — their fuzzy/interactive needs don't fit an in-TUI palette.

**Open questions**

- Should commands record history (Up/Down at prompt) and support a `:repeat`?
- Alias policy for multiword commands (e.g. /sampler vs /smp)?
- Should `?`/F1 open command help with the full catalog grouped by category?

**Depends on**

- FEAT tui shell

**Acceptance criteria**

- Typing `/` shows a ranked command list; typing partial text filters fuzzily with visible match highlighting.
- Tab completes the highlighted command and, for commands with args, completes arg values (paths, instrument/channel names).
- Unit tests cover fuzzy scoring edge cases and every builtin command handler against a mock CommandContext.
- A command with a bad argument reports an inline error in the status line without crashing.
- Every handler returns a typed, JSON-serialisable `CommandResult`; no handler depends on Ink or terminal dimensions.
- A session can be constructed headlessly from a plain object and used to execute/inspect commands in a unit test (this is the seed for FEAT-32).

**Implementation (2026-09-17)**
`src/tui/commands/` — `fuzzy.ts` (pure subsequence scorer), `registry.ts` (tokenizer, arg parser/flags, fuzzy suggestions, async arg completers), `builtins.ts` (~24 commands), `types.ts` (`CommandResult<T>`, `CommandContext` with `exit`/`listCommands`). Commands are pure over `Session` and Ink-free, satisfying the scriptability constraint. The Ink command bar renders ranked suggestions with Tab completion.

### FEAT-21 — TUI shell: persistent tracker + song info layout

- priority: critical
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, layout, ux
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Build the Ink app shell with a fixed three-zone layout: header (song title/author/system/tuning/tempo + transport state), body (persistent tracker pattern grid viewport, always visible), and command bar (input + suggestion list) at the bottom with a status/toast line. The tracker is never replaced by a full-screen modal; other views (mixer, sample list) open as overlays that leave the header and command bar intact.

**Architecture**
New src/tui/App.tsx (Ink), src/tui/components/SongHeader.tsx, PatternView.tsx, StatusBar.tsx, CommandBar.tsx, Overlay.tsx. A useSongModel/usePlayback hook layer mirrors App.tsx state (song, project, settings, mode, channelVolume/mute, masterVolume, currentTime, status). Entry src/tui/main.tsx. Rendering uses monospace, fixed columns; channel colors from existing theme.ts. Bootstraps exactly like App.tsx: loadDefaultSong → parseFurFile → parseProject → buildSamplerSequence → backend.loadSampler.

**Key decisions**

- Persistent tracker means the pattern grid is always mounted and only its cursor/scroll changes.
- Header/command bar/status are fixed rows; tracker takes all remaining vertical space.
- Keyboard-first: arrow/PageUp/Down/Home/End track, Space play/pause, Esc clears command or closes overlay.
- No mouse dependency (Ink is keyboard-first).

**Alternatives considered**

- OpenTUI for render performance: deferred; revisit only if Ink re-render cost is measurable.
- Separate screens per feature: rejected — user explicitly wants a persistent tracker view.

**Open questions**

- Minimum terminal size to support, and how to degrade below it?
- Sixel/kitty-graphics cover art in the header — in scope or text-only for milestone 1?

**Depends on**

- FEAT de-electron-ify
- FEAT audio shim

**Acceptance criteria**

- Running `node dist/tui/main.cjs` (or the bin) opens the TUI, loads the bundled song and shows the tracker without errors.
- Resizing the terminal reflows header/status while keeping the tracker usable.
- Song title/author/tempo/position/play state are visible at all times.

**Comments**

- FEAT-15 (cover art editor) is React-DOM bound; its renderer can later feed a sixel/kitty image in the header, but that is out of milestone 1.

**Implementation (2026-09-17)**
`src/tui/App.tsx` renders a fixed layout: `SongHeader` (title/author/system/tempo/order strip/transport clock), always-visible `PatternView` (4 channels, cursor + playhead highlight), `StatusBar`, and the `CommandBar` with suggestions. `src/tui/session.ts` is the framework-agnostic session (also the seed for FEAT-32). Entry `src/tui/main.tsx`; viewport follows terminal resize via `useWindowSize`.

### FEAT-19 — Audio: node-web-audio-api backend shim

- priority: critical
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, audio, web-audio
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Make src/audio backend-agnostic by depending only on a minimal Web Audio surface. Add a runtime module that supplies createAudioContext()/createOfflineAudioContext()/decodeAudioData from node-web-audio-api in Node and the browser globals in the (legacy) web build. webAudioBackend.ts, webSampler.ts and offline.ts should need only type/import changes.

**Architecture**
Add dependency node-web-audio-api. New src/runtime/audioContext.ts exporting createRealtimeContext(), createOfflineContext(), decode(ctx,bytes). Change webAudioBackend.ts/offline.ts to import from it instead of using global AudioContext/OfflineAudioContext. Introduce a local type alias (e.g. LanternAudioContext) based on the constructor return type to avoid DOM lib coupling. tsconfig: keep DOM types for now but isolate them behind the runtime module.

**Key decisions**

- Keep the existing AudioBackend interface unchanged so downstream UI/TUI code is isolated from the host swap.
- Use node-web-audio-api's realtime output (default device); document selecting a device later.
- Reuse src/audio/offline.ts as-is for WAV export bounce (no browser needed).

**Alternatives considered**

- audify/RtAudio: rejected — would require a new synth graph implementation.
- Port the synth to Rust/native: rejected — duplicates DSP work and breaks parity.
- Web Audio inside a hidden Electron process: rejected with the Electron retirement.

**Open questions**

- Does node-web-audio-api support every node type the chain uses (waveshaper, delay, convolver, AudioWorklet)? Verify per-node and document gaps.
- Is OfflineAudioContext fully supported for the MASTER FX render path?
- Sample-rate negotiation: fixed 44100 or follow device?

**Depends on**

- FEAT de-electron-ify

**Acceptance criteria**

- A Node smoke script plays the bundled stems through node-web-audio-api and reports currentTime advancing.
- src/audio unit tests (webSampler) run under Node against the shim.
- Offline FX render produces byte-comparable output to the previous browser build for a fixed input (documented tolerance).

**Comments**

- Primary risk card: if a required node type is missing, fall back to a scoped native implementation for that node only, behind the same AudioBackend interface.

### FEAT-18 — De-Electron-ify: shared Node asset loader + file IO layer

- priority: critical
- tags: tui, terminal, ink, node, migration, plan-terminal-lantern-tui-migration, io, electron-removal, architecture
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: card
- parent: FEAT-17

**Plan:** Terminal Lantern — TUI migration _(#plan-terminal-lantern-tui-migration)_

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

Why TypeScript: ~4.4k lines of tested core logic reuse directly, node-web-audio-api provides a real Web Audio API in Node so src/audio ports with a shim rather than being rewritten, the WASM DSP already runs in Node, and Ink reuses the existing React component/state mental model. Rust/Go would force a full rewrite of the parser, audio engine, and test suite for a single-binary benefit that is not needed for a 4-channel tracker.

**Approach**
Create a platform/runtime module that replaces src/main (Electron) with pure Node. Asset loading reads bundled assets from a resolved assets dir (repo-relative in dev, next to the bundle when packaged); file open/save becomes direct fs read/write plus a TUI path prompt. Keep the IPC-facing shape (LoadedSong, SaveFileRequest, AudioFileChoice) so core/UI code that consumed window.lantern is a thin adapter away.

**Architecture**
New src/runtime/assets.ts (loadDefaultSong, readAsset, listSourceSamples) built on node:fs/promises; new src/runtime/files.ts (readFileSafe, writeFileSafe, ensureExt, saveFilters). Refactor src/shared/types.ts to a dependency-free LoadedSong/SaveFileRequest (drop IPC enum and LanternApi, or keep as Arc). src/main/assetLoader.ts and src/preload/index.ts are deleted at the cleanup card. Assets currently loaded: assets/lmp-default-proj.lampjson, assets/0..3.ogg stems, assets/SourceSamples/0..5.ogg, flight_school_night_shift.wav/.fur.

**Key decisions**

- Domain/file format stays identical; no changes to .lampjson, .fur, WAV/MIDI/PNG output.
- Assets resolve relative to a single resolved root, overridable by env (LANTERN_ASSETS).
- No Electron APIs may remain in the import graph of the TUI entrypoint.

**Alternatives considered**

- Keep Electron hidden in the background: rejected — 'retire Electron' decision and no need for Chromium.
- Use an npm file-picker package: rejected for v1; argument is a path in the command bar with Tab completion.

**Open questions**

- Where should assets live when the package is installed globally — inside the package, or a user data dir?
- Should missing bundled assets be a hard error or a graceful empty project?

**Acceptance criteria**

- loadDefaultSong succeeds under plain node with no Electron present.
- Unit test loads the bundled project + stems + samples from disk and asserts LoadedSong fields.
- grep of src/runtime and the TUI entrypoint shows zero electron imports.

**Comments**

- Implemented 2026-09-17. Added src/runtime/assets.ts (resolveAssetsDir, readAsset/readAssetText, readBytesIfPresent/readTextIfPresent, listSourceSamples, async loadDefaultSong) and src/runtime/files.ts (SAVE_FILTERS, ensureExtension/extensionOf, fileExists, readBytesSafe/readTextSafe, writeBytesSafe with optional overwrite/createDirs, readAudioChoice).
- Asset root resolution order: explicit root > LANTERN_ASSETS > <cwd>/assets > <scriptDir>/assets and two parents up; a candidate containing lmp-default-proj.lampjson wins. Deliberately avoids import.meta.url/__dirname so it works both CJS-bundled and ESM.
- src/shared/types.ts is now dependency-free (LoadedSong, AudioFileChoice, SaveFileRequest only). The Electron bridge surface moved to src/shared/ipc.ts (IPC + LanternApi); main/preload/renderer global.d.ts updated to import from there.
- src/main/assetLoader.ts is now a thin Electron dialog adapter delegating to the runtime modules; the three `from "electron"` imports remaining in the tree are main/index.ts, main/assetLoader.ts and preload/index.ts, all deleted in FEAT-30.
- Note: this repo ships no bundled stems, chip mix or .fur (only lmp-default-proj.lampjson + SourceSamples/0..5.ogg), so loadDefaultSong returns raw=undefined, stems=[null×4], chipMix=null — matching the current GUI behaviour.
- Verification: `npm test` 12 files / 92 tests green (new tests/unit/runtime-assets.test.ts, 7 tests); both tsconfigs typecheck clean. ESLint has no config in-repo (npx eslint fails on missing eslint.config.*), so only Prettier was applied.

### FEAT-16 — Perc mode: auto-preview the rendered one-shot on parameter slider release

- priority: medium
- tags: spectral, percussion, ui, preview
- created: 2026-09-17
- updated: 2026-09-17

**Request (John):** In PERC MODE, letting go of any percussion parameter slider should audition the final sound automatically, so results can be heard without scrolling back up to the Preview button.

**Design**

- Fire a preview on the released slider only (range inputs), not on every `onChange` during the drag (renders already run continuously during the drag).
- Must wait for the async Spectral re-render to finish before previewing, otherwise `sampler.buffer()` sees `fused === null` mid-render and the preview errors/plays stale audio.
- Reuse the existing top-bar Preview path: `backend.preview(index, reference)`.
- Scope: sliders inside `PercussionControls` (primary + Advanced) while percussion is enabled.

**Architecture**

- `SamplerEditor.tsx`: add optional `onCommit` to the shared `Slider` (fires on pointerup/keyup), thread an `onPreview` callback into `PercussionControls`, and add a pending-preview guard in the existing `useAnimationFrame` poll that only previews once `backend.fusionRendering(index)` is false and `backend.fusionReady(index)` is true (with a short grace window so a not-yet-started render isn't skipped).

**Acceptance**

- Releasing any percussion slider plays the freshly rendered result once.
- No preview fires mid-drag; no error/stale preview when the render is still in flight.
- Existing Preview button and all tests unchanged.

### FEAT-14 — Percussion polish: punchier presets, drive/compression stage, simplified UI

- priority: high
- tags: spectral, percussion, ui, prism_dsp, dsp
- created: 2026-09-17
- updated: 2026-09-17

**From John's testing feedback:**

1. **Punch/speed.** Kick and Metal "feel a bit slow, less intense". Make presets snappier: faster transient attack, shorter pitch-sweep time, steeper pitch drop.
2. **Steeper pitch mods for drums.** Increase the pitch envelope depth (larger start offset, lower end).
3. **Drive + compression.** Add a distortion and a compression stage to the percussion chain, each independently activatable.
4. **Simpler UI.** Reduce the number of exposed parameters. Primary controls (e.g. Preset, Punch, Body, Noise, Pitch Drop, Decay, Length, Drive, Compression); move the rest behind an "Advanced" disclosure.

**Design**

- DSP: add `drive_amount_pct` (soft-clip/tanh or waveshaper) and `compress_amount_pct`/`compress` to `PercussionParams`, applied after the modal/noise synthesis and before peak normalisation. Keep both at 0/default off so existing renders are unchanged.
- Presets: retune Kick/Snare/Metal/Hat (steeper `pitch_start`/`pitch_end`, shorter `pitch_decay`, punchier transient, slightly longer snare/hat sustain so they read as hits not clicks).
- UI: split into primary + collapsible Advanced; add Drive and Compression and a preset-refresh path.
- Tests: cargo (drive increases harmonic content / stays finite; compression reduces peak-to-RMS ratio), TS unit + project JSON round-trip for the new fields, and the existing percussion E2E still passes.

**Depends on / relates to** BUG-1 (one-shot audibility) — fix that first so short hits can be evaluated.

### BUG-1 — Snare/Hat percussion one-shots are inaudible (sampler ADSR attack outlasts the hit)

- priority: critical
- tags: spectral, percussion, audio, one-shot
- created: 2026-09-17
- updated: 2026-09-17

**Symptom:** With Percussion + One-Shot enabled, Kick/Metal are heard but Snare/Hat are essentially silent.

**Root cause:** `buildVoice` applied the _instrument's_ ADSR (attack/decay/sustain) on top of the percussion render, which already has its own baked amplitude envelope. Long instrument attacks outlast short hits (Snare 0.35s, Hat 0.15s).

**Fix (implemented):** Added `envelopeShape(settings)` in `src/core/sampler.ts`. When `settings.spectral.enabled && settings.spectral.oneShot` it returns `{ attack: 0.003, decay: 0, sustain: 1 }`, bypassing the instrument ADSR; otherwise it returns the normal clamped ADSR. `envelopeAt` now delegates to it, so `buildVoice`, `Voice.levelAt`, `Voice.release` and the offline export path all agree. `buildVoice` uses the shape's attack/decay/sustain for its gain ramps.

**Tests:** `tests/unit/webSampler.test.ts` — added `buildVoice one-shot Spectral envelope`: long 0.338s attack resolves to full level at +0.003s for one-shots, and still ramps over the instrument ADSR (0.338s) when not one-shot.

**Acceptance criteria**

- Snare and Hat presets are clearly audible as one-shots on an instrument with a long attack. ✅
- Existing looped Spectral instruments are unchanged. ✅ (looped test asserts 0.338s attack retained)
- Regression test covers a short one-shot with a long instrument attack. ✅

### FEAT-13 — Structural Loop Length modulation for SpectralPrism

- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, modulation, structural, prism_dsp
- created: 2026-09-17
- updated: 2026-09-17

**Decision (2026-09-17): baked tiling (option A).** Playback-time envelope was rejected because native Web Audio looping cannot vary loop points smoothly (loopStart/loopEnd are not AudioParams), so it would need new retrigger/crossfade voice machinery with higher click risk and poorer testability.

**Implementation**

- `prism_dsp::modulate`: added target index 13 `MOD_LOOP_LENGTH`, bumped `MOD_TARGET_COUNT` to 14, and `render_fused_loop_length_modulated_loop(...)`. It splits the base period into `LOOP_LENGTH_SEGMENTS` (8) slots; each slot is filled by tiling a phase-locked loop rendered at that slot's modulated length (tiling a periodic buffer is inherently click-free), joins are **overlap-add crossfades**, and the super-loop seam is faded. Output length stays equal to the unmodulated base length. When the loop-length bit is clear it delegates to `render_fused_modulated_loop` for exact parity.
- WASM: new `render_fused_loop_lengths` export; `PrismWasmModule.render_fused_loop_lengths`; `makeSpectralRenderer` routes to it when a loopLength route is active (Worker + main-thread loader both wired).
- TS: `loopLength` added to `SpectralParamId` / `SPECTRAL_PARAMS` (index 13, unit "s"); it appears in the existing modulation UI dropdown automatically.

**Tests**

- Cargo (4 new): no-target parity, base-length preserved + output changes, seam discontinuity reduced by the wrap, join step reduced by overlap-add crossfade.
- TS unit (4 new, `tests/unit/loop-length.test.ts`): routing selects the structural path, falls back to the modulated path otherwise, real-engine length-preserving + changed output, JSON round-trip.

**Acceptance criteria**

- Decision documented (this card + module docs). ✅
- Cargo tests prove click-freedom (seam + join) and periodicity across a loop-length sweep (length preserved). ✅

**Known limitation / alternative considered.** Baked tiling keeps output length fixed and click-free at joins, but joins blend two different-period loops, so very fast/large sweeps will show brief timbral crossfades. Combining Loop Length with the other 13 targets is supported: each segment samples the others at its representative control point.

### FEAT-1 — SpectralPrism — Offline Modulation & Percussion Synthesis

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: epic

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Cards**

- FEAT-2 — SpectralPrism modulation model + Project JSON
- FEAT-3 — prism_dsp: per-hop modulated render (render_fused_modulated_loop)
- FEAT-4 — WASM binding + Spectral Worker protocol for modulation tracks
- FEAT-5 — Spectral tab modulation UI + re-render lifecycle
- FEAT-6 — Modulation test coverage (cargo + unit + E2E)
- FEAT-7 — Pin/vendor prism_dsp crate and rebuild WASM
- FEAT-8 — Percussion synthesis in prism_dsp (render_percussion)
- FEAT-9 — One-shot (non-looping) Spectral playback path
- FEAT-10 — Percussion params + Project JSON + Spectral tab UI
- FEAT-11 — Percussion WASM/worker/engine plumbing + note mapping
- FEAT-12 — Percussion test coverage (cargo + unit + E2E)

### FEAT-7 — Pin/vendor prism_dsp crate and rebuild WASM

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, prism_dsp, wasm, build, infra
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Done (2026-09-17): vendored (option b).**

- `native/prism_dsp/` now contains the `prism_dsp` crate sources + LICENSE with a standalone `Cargo.toml` (`realfft = "3.5"`); no sibling checkout needed.
- `native/prism-wasm/Cargo.toml` points at `prism_dsp = { path = "../prism_dsp" }`.
- `scripts/vendor-prism-dsp.mjs` (+ `npm run vendor:prism-dsp`) re-vendors from a SpectralPrism checkout in one command and stamps the upstream version.
- `scripts/build-prism-wasm.mjs` guards the vendored sources and no longer requires the sibling path.
- `native/prism-wasm/PRISM_DSP_SOURCE.md` documents the workflow and alternatives.
- Rebuilt the WASM from the vendored crate (`render_percussion` present) and copied artifacts into `src/renderer/vendor/prism/`.
- Verified standalone: `cargo test --manifest-path native/prism_dsp/Cargo.toml` → 95 passed. App: typecheck, 77 unit, 22 Electron E2E, 2 web E2E pass.

### FEAT-12 — Percussion test coverage (cargo + unit + E2E)

- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, tests, percussion
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Cargo: a kick has dominant energy below ~150 Hz and decays to near-silence within its configured length; a snare has a broadband/flat spectrum and a short decay; output length is bounded and has no NaNs; parameters are reproducible. TS unit: percussion params round-trip; render routing selects percussion. E2E: enable percussion, render, confirm a non-empty result waveform and that the instrument plays once.

**Architecture**
SpectralPrism prism_dsp tests; tests/unit/core.test.ts, tests/unit/export.test.ts; tests/e2e/editor.spec.ts.

**Depends on**

- Percussion WASM/worker/engine plumbing + note mapping

**Acceptance criteria**

- All listed tests pass; a real export containing percussion has no silent/gap artifacts.

### FEAT-11 — Percussion WASM/worker/engine plumbing + note mapping

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, wasm, worker, percussion, audio
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Export `render_percussion` from `native/prism-wasm/src/lib.rs`; add it to `PrismWasmModule`; route through `spectralRender` (choosing percussion vs fusion) so the existing Worker path and generation guard are reused; pass the tracker note as the pitch reference. Ensure `SamplerEditor`'s status text and `fusionReady` still apply, and that `effectiveClip`/`effectiveWaveform` show the percussion result.

**Architecture**
native/prism-wasm/src/lib.rs, src/wasm/{prism.ts, prism.worker.ts, prismWorkerClient.ts, prismWorkerProtocol.ts}, src/core/spectral.ts, src/audio/webSampler.ts, src/core/pitch.ts (note→rate).

**Key decisions**

- Percussion reuses the same worker + supersede guard as fusion.
- Root note stays DEFAULT_ROOT_NOTE (60); the tracker note is applied as playback rate.

**Depends on**

- Percussion synthesis in prism_dsp (render_percussion)
- One-shot (non-looping) Spectral playback path

**Acceptance criteria**

- An enabled percussion instrument renders off-thread, shows a result waveform, and plays the short buffer at the written note.

### FEAT-10 — Percussion params + Project JSON + Spectral tab UI

- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, ui, percussion, project-json, spectral
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Extend `SpectralSettings` with a `percussion` block: `{ enabled, noiseAmount, noiseColor, transientAmount, pitchStartSemis, pitchEndSemis, pitchDecay, ampDecay, click, partialCount, partialDecay, ... }`, defaulting disabled so nothing changes until enabled. Round-trip in Project JSON with a legacy-safe default. Add a Percussion section/tab to the Spectral tab with a pitch+amp envelope graph (reuse the AdsrGraph pattern) and sliders/NumberInputs, wired to auto re-render like other Spectral edits.

**Architecture**
src/core/spectral.ts, src/core/project.ts, src/renderer/components/SamplerEditor.tsx, src/renderer/components/AdsrGraph.tsx (or a new PercussionEnvelopeGraph).

**Key decisions**

- A flat parameter block (not a mod matrix) for v1.
- Percussion may also be driven by the offline modulation feature for pitch/amp sweeps (hence the dependency).

**Depends on**

- One-shot (non-looping) Spectral playback path
- SpectralPrism modulation model + Project JSON

**Acceptance criteria**

- Controls appear, persist across reload, and changing them re-renders the result.

### FEAT-9 — One-shot (non-looping) Spectral playback path

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, audio, playback, spectral, percussion
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
`SamplerEngine.renderSpectral` currently forces `startSec=0; endSec=duration; looping=true` once a fused clip exists, so every Spectral instrument loops forever. Percussion needs the opposite. Add an explicit per-instrument choice (e.g. `settings.spectral.looping` / one-shot flag, default true to preserve current behaviour) and honour `settings.looping` instead of overwriting it. For one-shot renders set start/end to the full rendered clip but leave `looping=false`, letting the sampler ADSR/release drive playback. Keep the save/restore of the pre-Spectral loop flag exactly as today.

**Architecture**
src/audio/webSampler.ts (renderSpectral, buffer, voice path), src/core/sampler.ts (playback), src/core/spectral.ts (savedLooping + new flag), src/core/project.ts.

**Key decisions**

- Force-loop remains the default so existing projects are unchanged; percussion instruments opt into one-shot.

**Alternatives considered**

- Always one-shot when percussion is enabled (rejected: mixes two concerns and removes the ability to loop a percussion render).

**Depends on**

- Percussion params + Project JSON + Spectral tab UI

**Acceptance criteria**

- An existing Spectral project still loops unchanged.
- A one-shot Spectral instrument plays once, stops, and is not looped; Project JSON round-trips the flag.

### FEAT-8 — Percussion synthesis in prism_dsp (render_percussion)

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, percussion, prism_dsp, rust, dsp
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Decision (2026-09-17, from John):** Percussion is a **third pipeline step**, activated for _any_ Fusion Mode, that applies percussion parameters to the **output of the Fusion stage**. It is not a Fusion mode itself, not a separate instrument type. Pipeline: `Sample A freeze/resynth → Fusion(mode, A+B) → Percussion post-stage → one-shot buffer`.

Consequences for the DSP:

- `render_percussion(input: &LoopBufferData, params: &PercussionParams) -> LoopBufferData` takes the already-fused stereo buffer (any mode's output) rather than re-reading Sample A.
- Modal body peaks are extracted from the **fused output's** spectrum, so Cross-Synth / Ring Modulate / Spectral Max etc. still colour the percussion.
- Output is inherently one-shot (decays to silence in `length_seconds`), which is what FEAT-9's non-looping playback path consumes.
- New `prism_dsp/src/percussion.rs`, exported from `lib.rs`; `PercussionParams` + Kick/Snare/Metal/Hat presets.

Open questions from the original plan are now resolved: post-fusion stage; chromatic playback handled app-side (FEAT-11) via playback rate, root note stays `DEFAULT_ROOT_NOTE`.

### FEAT-6 — Modulation test coverage (cargo + unit + E2E)

- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, tests, modulation
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Cargo: constant-track parity, a sweep changes output monotonically, periodicity/click-freedom retained, finite samples. TS unit: route round-trip, LFO/ramp/random track sampling values, worker protocol. E2E: add a route, wait for "Rendered result is ready", confirm the result waveform changes and no console errors.

**Architecture**
SpectralPrism prism_dsp tests; tests/unit/*; tests/e2e/editor.spec.ts.

**Depends on**

- Spectral tab modulation UI + re-render lifecycle
- WASM binding + Spectral Worker protocol for modulation tracks

**Acceptance criteria**

- All listed tests pass in `npm test`, `npm run typecheck` and `npm run test:e2e`.

### FEAT-5 — Spectral tab modulation UI + re-render lifecycle

- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, ui, modulation, spectral
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Add a Modulation section to the Spectral tab: a list of routes with a target dropdown listing every output-contributing parameter (grouped by Sample A / Sample B / Fusion / Structural, and filtered to the ones valid for the current fusion mode), shape, depth, rate and bipolar toggle; overlay the modulation range on each target slider and annotate the Result waveform. Re-render automatically on change, reusing the existing `renderSpectral` generation counter + `rendering` flag so a newer edit supersedes an in-flight render, and debounce slider drags.

**Architecture**
src/renderer/components/SamplerEditor.tsx (SpectralTab, Slider), src/renderer/App.tsx onUpdateSetting, src/audio/webSampler.ts renderSpectral, src/renderer/styles.css.

**Key decisions**

- Depth is expressed in the target's own units (%/semitones).
- Auto re-render, no manual Render button (consistent with the existing 0007E-PLAN-066 decision).

**Depends on**

- SpectralPrism modulation model + Project JSON

**Acceptance criteria**

- Adding or editing a route triggers one render and never leaves a stale waveform.
- The UI shows base + range; controls are disabled with a clear hint when the WASM engine is unavailable.

### FEAT-4 — WASM binding + Spectral Worker protocol for modulation tracks

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, wasm, worker, modulation
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Extend `native/prism-wasm/src/lib.rs` with `render_fused_modulated` taking flat `Float32Array` tracks (one value per hop, plus a target id per track), or add optional track arrays to `render_fused`. Update `PrismWasmModule` in `src/wasm/prism.ts`, the request in `prismWorkerProtocol.ts`, and `prismWorkerClient.ts` so track buffers transfer zero-copy. `makeSpectralRenderer` samples the shapes (LFO/ramp/random) into numeric tracks on the main thread so the DSP stays shape-agnostic.

**Architecture**
native/prism-wasm/src/lib.rs; src/wasm/{prism.ts, prism.worker.ts, prismWorkerClient.ts, prismWorkerProtocol.ts}; src/core/spectral.ts (track sampler).

**Key decisions**

- The DSP receives numeric tracks only, never shape semantics.
- Sampling happens in TS before the render is dispatched.

**Alternatives considered**

- Encode shapes in Rust (rejected: keeps spectral shape semantics split across two languages and complicates future shapes).

**Depends on**

- prism_dsp: per-hop modulated render (render_fused_modulated_loop)
- SpectralPrism modulation model + Project JSON

**Acceptance criteria**

- A no-modulation call is unchanged.
- A track buffer round-trips through the worker; unit test with a fake transport passes.

### FEAT-3 — prism_dsp: per-hop modulated render (render_fused_modulated_loop)

- priority: critical
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, modulation, prism_dsp, rust, wasm
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Add a sibling to `render_fused_loop` in the SpectralPrism `prism_dsp` crate that accepts per-hop parameter tracks and interpolates them inside the resynthesis loop, covering every parameter that contributes to the output. Reuse `render_channel` / `FreezeResynth`; when every track is constant, fall through to the untouched `render_fused_loop` so there is a bit-identical fast path. Parameters fall into three classes: **resynthesis-time** (Tune A/B, Volume A/B, Formant A/B, Stereo Width, Fusion amounts) are recomputed per hop cheaply; **analysis-time** (Freeze Point A/B) precompute K frozen spectra per source across the loop and blend magnitude between adjacent keyframes per hop, keeping phase0 from the nearest keyframe and one continuous phase accumulator (interpolating absolute phase is ill-defined and cancels); **structural** (Loop Length) changes `num_hops`/`out_len` and therefore cannot vary per hop without breaking the phase-locked period — give it a dedicated strategy (e.g. tile/crossfade renders of different lengths, or apply it as a loop-length envelope at playback) rather than a naive per-hop interpolation.

**Architecture**
SpectralPrism/crates/prism_dsp/src/fusion.rs (+ render.rs, resynth.rs); new `ModulationTrack` / `ModulatedRenderParams` types; public 8-mode FusionMode API and existing tests stay intact.

**Key decisions**

- Apply modulation per hop, not via a time-domain crossfade — render.rs documents comb-filtering/phasing from summing out-of-phase snapshots.
- Constant tracks use the existing code path exactly.
- Freeze-point modulation uses keyframe-blended spectra rather than per-hop re-analysis.
- Track targets span all three parameter classes (resynthesis-time, analysis-time, structural), not just the resynthesis-time ones.

**Alternatives considered**

- TS-side time-sliced re-render + crossfade (rejected: phase-locking across slices is hard and the docs warn about phasing).
- Real-time Web Audio LFO modulating the played buffer (rejected: the user asked for the transformation baked into the result; Spectral results are pre-rendered and looped, and `renderSpectral` generation-guards only apply to renders).

**Open questions**

- Keyframe count/placement for freeze-point modulation (uniform vs user keyframes); per-hop CPU cost ceiling for an 8 s loop at 48 kHz.
- Loop Length modulation strategy: tile/crossfade renders of different lengths vs a playback-time loop-length envelope.

**Depends on**

- Pin/vendor prism_dsp crate and rebuild WASM

**Acceptance criteria**

- Cargo tests prove constant-track parity with render_fused_loop.
- A monotonic sweep measurably changes output; loop periodicity/click-freedom is retained; all samples finite.

### FEAT-2 — SpectralPrism modulation model + Project JSON

- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, modulation, project-json
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Plan:** SpectralPrism — Offline Modulation & Percussion Synthesis _(#plan-spectralprism-offline-modulation-percussion-synthesis)_

**Plan summary**
Two new capabilities for the SpectralPrism sampler in the Lantern Music Player (0008, a copy of the 0007-Electron port).

1. Offline modulation: let the SpectralPrism sliders be transformed over time (LFO/ramp/random) and have that transformation baked into the rendered result. Today the sliders are static scalars passed to `prism_dsp::fusion::render_fused_loop`; the correct place to apply time variation is per-hop inside the phase-vocoder resynthesis loop, not via time-domain crossfades.

2. Percussion synthesis: extend SpectralPrism so it can synthesize kicks, snares and other digital percussion, rather than only sustained frozen loops. This needs a transient/noise + pitch/amp-envelope voice in `prism_dsp` and a one-shot (non-looping) playback path in the app.

Architectural fork (flagged on the epic and cards): the DSP crate lives in the sibling SpectralPrism repo, referenced by path from `native/prism-wasm/Cargo.toml`. Both features are far cleaner if `prism_dsp` is extended and the WASM rebuilt; pure-TS alternatives are captured but rejected. This plan is design-only — no code has been written.

**Approach**
Add a modulation routing layer to `SpectralSettings` in `src/core/spectral.ts` rather than a new top-level settings object. A route is `{ target: SpectralParamId, shape: "lfo" | "ramp" | "random", depth: number, rateHz: number, phase: number, bipolar: boolean }`. The existing scalar fields stay as the slider's base value; a route adds ±depth at render time. **Every parameter that contributes to the SpectralPrism output is a valid target**: Freeze Point A/B, Tune A/B, Volume A/B, Formant A/B, Stereo Width, every Fusion Amount (Mix, Cross-Synth, Convolve, Ring Modulate), and Loop Length. Ship a small fixed number of routes per instrument (3 is a reasonable start). Persist as `spectral.modulation` in Project JSON; an absent field means no modulation, so legacy projects render bit-identically. A `SpectralParamId` registry records each target's unit, its parameter class (resynthesis-time / analysis-time / structural) and which fusion modes expose it, so the UI and the DSP track sampler share one source of truth.

**Architecture**
src/core/spectral.ts (SpectralParamId + registry, ModRoute type, defaults, track sampler), src/core/project.ts (projectToJson/projectFromJson), tests/unit/core.test.ts.

**Key decisions**

- Reuse the existing scalar slider fields as the modulation base value — no duplicated base-b field.
- Every output-contributing parameter is modulatable: Freeze Point A/B, Tune A/B, Volume A/B, Formant A/B, Stereo Width, all Fusion Amounts, and Loop Length. The Fusion mode selector itself is not a numeric target.
- Targets are grouped by parameter class because each class needs different DSP handling (per-hop / keyframe spectra / structural); see FEAT-3.
- Zero routes / disabled routes must produce byte-identical output to today.

**Alternatives considered**

- A separate instrument-level `modulation` object (rejected: spectral concerns stay together and render-versioning is simpler).

**Open questions**

- How many simultaneous routes should the UI allow?
- Should LFO phase be free-running across notes or retrigger on each note (matters once percussion/one-shots exist)?

**Acceptance criteria**

- Types and defaults exist; the registry drives both UI and track sampling.
- JSON round-trip unit test passes; a legacy project with no `modulation` field yields an unchanged render.

### TASK-1 — Keyboard: drop note-entry keys (keep z for last value) and Shift+I opens Instruments
- priority: medium
- tags: tui, keyboard, tracker, instruments, ux
- created: 2026-09-17
- updated: 2026-09-17

Direct UX change requested after FEAT-88.

**What changed**
- Removed keyboard note entry entirely (previously uppercase `Z S X D C V G B H N J M` plus lowercase `d v g b h n j m l , .`). The `NOTE_KEYS` table and its lookup in `src/tui/App.tsx` are gone.
- `z` is the only note-ish key left: it places the last value/note (`Session.applyLastValue()`), as before. `R`/`Shift+R` still flood-paste.
- Also removed the now-dead `+`/`-` entry-octave keys (nothing reads `lastOctave` from a key path any more; the `/octave` command and Session API are untouched).
- Added `Shift+I` (uppercase `I`) in tracker mode to open the Instruments panel (`overlay = "instruments"`), alongside the existing `v` (edit cursor instrument on its mode tab).
- Updated `HelpOverlay` shortcuts and `explainer.ts` `trackerActionHint` (note column now reads "z last value · v instrument · enter actions · ctrl+space audition").

**Decisions**
- Notes are now entered via `/note C-4` (or paste), then repeated with `z`; this frees all letter keys for commands/shortcuts.
- Kept lowercase `q/a/w/s` (value adjust) and `x/c` (clear/note-off) as-is.
- Left `/octave` and `lastOctave` in Session for script/API compatibility even though no key uses them.

**Verification**
- Added `tui-explainer` test: `I` opens the Instruments panel and `d g b h n j m l` leave the cursor cell's note unchanged.
- `npm run test:all` green: typecheck, 222 tests, eslint, dependency audit, TUI build.

### TASK-2 — MicroTextures: Formant Shift, density modulation, and grain chaos
- priority: medium
- tags: microtextures, formant, granular, cycles
- created: 2026-09-18
- updated: 2026-09-18

User refinement of FEAT-123 MicroTextures:
1. Formant control should be a Formant Shift (semitones), not a vowel/F1/F2 filter.
2. Add a Density modulation parameter (glitch speed-ups/slow-downs).
3. Add a parameter that makes each grain very different in a digital-glitch way.

Done:
- Replaced `formantVowel/formantF1/formantF2` with `formantShift` (semitones). The Rust formant filter bank now scales its F1/F2 centre frequencies by `2^(shift/12)`; Resonance + Mix retained.
- Added `densityModRate` + `densityModDepth`: an LFO on the granular density in the Rust engine, so the grain stream speeds up/slows down.
- Added `grainChaos` (0..1): per-grain digital variation — quantised half-semitone pitch jumps, random reverse, hard pan scatter, gain swings, random grain length and per-grain bit reduction.
- Updated the WASM binding signature, rebuilt the WASM, updated serde, the MicroTx editor groups, and tests.

Tests: 282 TS pass (incl. real-WASM render); `cargo test` microtextures passes.

### TASK-3 — Grain Chaos scatters the per-grain downsample amount
- priority: medium
- tags: microtextures, granular, chaos, lofi
- created: 2026-09-18
- updated: 2026-09-18

User request: Grain Chaos should also vary the Downsample amount per grain.

Change: the per-grain sample-and-hold downsample factor is now derived from the Lo-fi `downsample` setting as its base and scattered per grain by `grainChaos` (`base * (1 + rand * chaos * 4)`), instead of a chaos-only range. When chaos is 0 the per-grain crush stays off (the global Lo-fi downsample still applies post-mix as before).

Rebuilt the WASM. Added a Rust test asserting grain chaos changes the rendered texture. cargo test microtextures 3/3; 282 TS tests pass; constraints green.

### TASK-4 — WAV export modal + Cycles track length, p opens Pattern Manager, undo/redo there
- priority: high
- tags: export, wav, cycles, patterns, tui, undo
- created: 2026-09-18
- updated: 2026-09-18

Three user requests:
1. WAV export should open a modal with the same options as the original app's WavExportModal (loops / fade in / fade out / peak normalize), plus a Track length control in Cycles Mode (the polymeter loop can be very long).
2. `p` on the main tracker opens the Pattern Manager.
3. Ctrl+Z / Ctrl+Y in the Pattern Manager undo/redo.

Done:
1. `WavExportOptions.lengthSeconds` caps one pass before arrange/envelope; `SessionState.wavExport` stores the options; `wavExportGroups()` renders the modal via ParamEditorOverlay with a `submit` action (key `e` = Export). `/export wav` with no path opens the modal; `/export wav <path>` still exports directly and now honours `--loops/--fade-in/--fade-out/--length/--normalize` falling back to the stored options. Track length row appears only in Cycles Mode. Added OverlayName/App overlay `wav`, reachability doc + OVERLAYS test.
2. App main key handler: `p` → `setOverlay("patterns")`.
3. PatternsOverlay useInput handles Ctrl+Z (undo) / Ctrl+Y (redo).

Tests: wavExportGroups track-length gating, `/export wav` opens the overlay, Pattern Manager ctrl+z/y undo-redo, and `p` opens the Pattern Manager (verified via App render). 286 tests pass; constraints green.

### TASK-5 — Choke setting + Pattern Manager opens on the cursor channel
- priority: high
- tags: choke, instrument, patterns, glitch, fx
- created: 2026-09-18
- updated: 2026-09-18

Two user requests:
1. A per-instrument "Choke" setting (default on) that hard-cuts a channel's sound when another note or an OFF plays there, skipping the release tail.
2. Entering the Pattern Manager should default to the channel currently selected in the Pattern Editor.

Done:
1. `SamplerSettings.choke` (default true) + serde. `Voice.cut()` in the realtime engine does a ~3 ms hard cut; `handleEvent` uses it on note-steal and OFF when the previous voice's instrument has choke on. Offline `cutVoice()` mirrors it. Toggle added to the Sampler editor's Polyphony group. Row audition also respects reverse/offset FX now.
2. PatternsOverlay seeds its channel from `state.cursor.channel` (clamped).

Tests: choke default + serde round-trip, choked vs released offline render differs, Pattern Manager opens on "Ch 3" when the cursor is on channel 3, plus glitch-FX tests (probability/ratchet/reverse/offset) and reverse offline render. 294 tests pass.

### TASK-6 — Enter on an FX column opens the FX-type picker
- priority: high
- tags: tracker, fx, tui, glitch
- created: 2026-09-18
- updated: 2026-09-18

User request: pressing Enter on an FX column should let you select the FX type.

Done: the tracker's Enter context menu now leads with an FX-type list when the cursor is on an effect column — every FX_CATALOG entry (01 pitch up, 02 pitch down, 09 tempo up, 0A tempo down, 10 chance, 11 ratchet, 12 reverse, 13 offset) plus "Clear effect". Added `Session.setEffectCode()` (keeps the slot's value) and App handling for the `set-fx:<code>` / `clear-fx` specials. The FX value is still adjustable with q/a afterwards.

Tests: `setEffectCode` writes the cell effect; contextActions on an FX column includes the FX entries. 297 tests pass.

### TASK-7 — Ratchet (and probability) now preview in the Pattern Editor
- priority: medium
- tags: preview, ratchet, glitch, tracker
- created: 2026-09-18
- updated: 2026-09-18

User report: ratchet didn't preview correctly in the Pattern Editor (row audition).

Cause: `collectNotes` (used by `auditionRow`) ignored the glitch FX — it emitted only one voice per note and no delay, so ratchet (and probability) had no effect in the audition.

Fix: `PatternNote` gained `delaySec`; `previewPattern` starts each voice (and its release/pitch ramp) at `when + delaySec`; `collectNotes` now applies 10xx probability (via the shared `rowRoll`) and expands 11xx ratchet into N evenly spaced hits across the row duration, matching `sequenceFromSong`.

Tests: added an audition test asserting a ratcheted row passes ≥4 delayed notes to `previewPattern`. 299 tests pass.

### TASK-8 — Ghost rows: lighter gray, follow-scrolling, and Cycles Mode
- priority: medium
- tags: tracker, ghosting, cycles, tui
- created: 2026-09-18
- updated: 2026-09-18

FOLLOW-UP 2: ghosts must fill the top/bottom of the window across multiple orders, and one channel wasn't showing them.
- `channelStreamCell` now WALKS the channel's order list in both directions, so stream rows outside the current pattern resolve to as many previous/next orders as needed to fill the window (no fixed single-adjacent-order band). Works for single-order channels too (wraps to itself).
- The window is now the full viewport (`windowSize = budget`) centred on the cursor/playhead; when ghosting is off it is clamped to the current order.
- Cycles `resolve` walks per channel the same way (uses `channelOrderRows`).
Verified: at order 1/row 0 the window is filled with ghost rows from prior orders; at order 0/row 2 channel 2 now shows its ghost content. 301 tests pass.

## Archived

### FEAT-80 — Remove timing FX from the tracker catalog

- priority: high
- tags: timing, bpm, legacy-model-removal, song-info, project, migration, plan-bpm-highlight-timing-editable-info, tracker, effects, cleanup
- created: 2026-09-17
- updated: 2026-09-17
- plan: game-boy-removal-bpm-highlight-timing-editable-info
- kind: card
- parent: FEAT-78

**Plan:** BPM + highlight timing, editable /info _(#plan-bpm-highlight-timing-editable-info)_

**Plan summary**
Three linked changes. (1) Timing collapses to two user concepts: a single BPM plus beat/bar row highlighting. Row duration becomes 60 / (bpm * beatRows), the tickRate/speed/virtualTempo model is removed and the timing FX are reduced to two BPM up/down effects, old projects migrate automatically. (2) Remove the remaining legacy chip surface from the model and UI (system, chips, wavetables, insType/legacy params, explainer prose). (3) `/info` opens an editable Song Info menu (reusing ParamEditorOverlay) showing every project field plus the BPM/beat/bar timing controls. Sequencing keeps the build green: core timing first, then the BPM-FX redefinition, then the legacy chip model scrub, then the overlay, then stepthrough/docs.

**Approach**
Drop the timing effects now that BPM is the only tempo control: 09 (Set Speed 1), 0F (Set Speed 2), F0 / C0-C3 (tick rate), FD/FE (virtual tempo). Keep 01/02 pitch slides and the rest.

**Architecture**
src/core/tracker.ts: FX_CATALOG keeps only non-timing entries. src/core/timing.ts no longer interprets those codes (already simplified by the timing card). src/tui/explainer.ts cellExplain already falls back to 'effect 0xNN - not documented'; adjust the wording if needed. src/tui/commands/builtins.ts/tracker tests updated. Decide whether to strip those effect slots from existing saved projects during migration or leave them inert (recommend leave inert and document).

**Key decisions**

- Leave legacy timing-effect cells in place but inert; saving preserves them so nothing is silently destroyed.
- 01/02 remain documented and functional.

**Alternatives considered**

- Actively strip the legacy effect slots on load (rejected: destructive and unnecessary).

**Depends on**

- Core timing model: BPM + beat/bar highlights

**Acceptance criteria**

- FX_CATALOG no longer lists any timing code.
- buildRowTiming ignores 09/0F/F0/C0-C3/FD/FE.
- tracker/explainer tests updated; typecheck + tests green.

### FEAT-15 — Cover Art editor — mecha/power-suit part designer

- priority: medium
- tags: cover-art, ui, editor, project-json, library, dither, plan-cover-art-editor-mecha-power-suit-part-designer
- created: 2026-09-17
- updated: 2026-09-17
- plan: cover-art-editor-mecha-power-suit-part-designer
- kind: card

**Plan:** Cover Art editor — mecha/power-suit part designer _(#plan-cover-art-editor-mecha-power-suit-part-designer)_

**Plan summary**
Future feature (requested by John). A dedicated Cover Art editor that opens as its own window and turns the animated cover into a part-based anime mecha / power-suit designer: equip, swap, transform and recolour individual parts to author a custom mech-suit, saved into the project file and backed by a reusable part library. Output stays the same 240×240 dithered artwork (4×4 Bayer).

**Approach**
Build a declarative, part-based cover-art model on top of the existing 32×32 compositor. A `CoverArtDesign` (palette + ordered part instances + animation options) lives in `ProjectFile`; a `PartLibrary` catalog provides part definitions (mask/primitive + palette roles + anchors + optional animation). The editor is a dedicated window/modal that previews the live 240×240 dithered canvas while the user browses slots and equips parts. Legacy projects with no `coverArt` design keep rendering the current procedural screen-wall/vat/plant scene unchanged.

**Architecture**
Data/model: add `coverArt?: CoverArtDesign | null` to `ProjectFile` (src/core/project.ts) and parse/serialise it (default = procedural scene). `CoverArtDesign = { version, palette: string[], slots: PartInstance[], background?: PartInstance[], animation: {...} }`; `PartInstance = { partId, x, y, flipX, flipY, scale, paletteMap, layer }`. Part library at `src/core/coverParts/` (or `assets/cover-parts/*.json`) with `PartDef = { id, name, category, size, primitives/mask, anchor, paletteRoles, defaultLayer, animation? }`. Rendering: refactor `src/renderer/components/CoverArt.tsx` so `render()` can paint either the procedural scene or a `CoverArtDesign` into the same `Float32Array(GRID*GRID*3)`; keep `dither()` (4×4 Bayer, 8 levels) and the 240 display / 1600 PNG output path shared. Editor UI: new `CoverArtEditor.tsx` opened from the Cover Art panel (reuse floating-window/modal pattern from SamplerEditor/MasterFxModal), with a zoomed grid canvas, slot/category browser, equip/remove/transform controls, palette swatches, layer order and an animation preview driven by the existing `CoverState` pulses/overall envelope. Library persistence: ship starter parts in-repo; support user part export/import and a persistent library (IndexedDB/localStorage) as a follow-up. Export unchanged: `CoverArtHandle.renderPngBytes()` and WAV embed continue to consume the live canvas.

**Key decisions**

- Part-based compositing, not a free pixel editor: the request is explicitly a mecha/power-suit kit-bash designer.
- Keep the 240×240 dithered output and 4×4 Bayer dithering exactly as today; the editor only changes what is composited before dithering.
- Reuse the existing 32×32 RGB float buffer + `blend`/`dither` pipeline rather than introducing a second renderer.
- Store the authored design in the project file; store reusable part definitions in a separate library so designs stay small and parts are shareable.
- Legacy projects (no coverArt field) must render the current procedural scene byte-for-byte.

**Alternatives considered**

- Pure free-pixel editor on 32×32 (Aseprite-style): rejected — no part reuse, and John wants swappable mecha parts.
- Full 3D mech modeller: rejected — out of scope and unnecessary for a 32×32 dithered target.
- Raster PNG sprite parts: workable but palette/scale edits and recolouring are harder than declarative mask/primitive definitions.
- Store every part inside each project file: rejected — bloats projects and blocks a shared library.
- Separate Electron BrowserWindow immediately: deferred — an in-app modal is simpler and consistent with existing editors; popping out can be added once the model is stable.

**Open questions**

- Should the editor open as a separate OS window (Electron BrowserWindow + IPC state sync) or an in-app floating window first?
- Is the current vat/plant scene kept as one selectable background theme, or is mecha mode a separate art mode?
- Internal resolution: stay at 32×32, or raise it (e.g. 80×80 / 120×120) so a mech-suit reads more clearly at 240×240?
- How many palette colours should be allowed so 4×4 Bayer dithering still reads cleanly?
- Part library scope: shipped starter set only, or user-authored + JSON import/export + persistent curated library?
- Do parts author multi-frame sprite animation, or is animation limited to per-part transform/glow driven by note pulses and the overall envelope?
- Does the mecha cover need to stay audio-reactive like the current scene (note pulses, overall level)?

**Acceptance criteria**

- A dedicated Cover Art editor opens from the cover panel and shows a live 240×240 dithered preview.
- The user can browse part categories, equip/replace/remove parts per slot, apply per-part transform (x/y/flip/scale), and recolour via a palette.
- The authored design round-trips through Project JSON, and projects without a design still render the existing procedural cover unchanged.
- A reusable part library exists with a starter set across categories; adding a part to the library does not require editing a project.
- Cover export still produces the crisp 1600×1600 PNG and the WAV embed uses the edited artwork.
- Rendering is deterministic (same design + time → same 32×32 buffer) and dithering remains 4×4 Bayer to 240×240.
- Unit tests cover model round-trip, compositor determinism and the library loader; an E2E test opens the editor, equips a part, and verifies the preview and saved project JSON change.

**Comments**

- Touches: src/renderer/components/CoverArt.tsx, src/renderer/App.tsx (coverRef/renderPngBytes usage), src/core/project.ts (ProjectFile + serialise/parse), src/renderer/styles.css, new src/renderer/components/CoverArtEditor.tsx and src/core/coverParts/.
- Current render facts to preserve: GRID=32 internal buffer, BAYER 4×4 at 8 levels, display canvas 240×240 (`image-rendering: pixelated`), PNG export 1600×1600, `CoverArtHandle.renderPngBytes()` consumed by App.tsx WAV export.
- Cover art is currently procedural and NOT stored in the project — this card introduces the first saved cover-art state.
