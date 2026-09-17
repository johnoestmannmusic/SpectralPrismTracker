# Project Kanban

<!-- Source of truth for project coordination. Managed by the KANBAN-MANAGE tool; safe to edit by hand. -->

## Features

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

## Bugs

## In Progress

## Blocked

## Implemented

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

## Archived
