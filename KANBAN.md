# Project Kanban

<!-- Source of truth for project coordination. Managed by the KANBAN-MANAGE tool; safe to edit by hand. -->

## Features

### FEAT-7 — Pin/vendor prism_dsp crate and rebuild WASM
- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, prism_dsp, wasm, build, infra
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
`native/prism-wasm/Cargo.toml` points at a sibling SpectralPrism checkout (`path = "../../../../SpectralPrism/crates/prism_dsp"`), which is not reproducible for other machines or CI. Decide and implement one option: (a) document + pin the external checkout (relative path plus a recorded revision) and fail the build clearly if it is missing; or (b) vendor the needed prism_dsp sources into the repo (or a git submodule). Then rebuild with `npm run build:prism-wasm`, commit `native/prism-wasm/pkg/` and the copied `src/renderer/vendor/prism/` output, and verify `spectralWasmAvailable()` in a smoke test.

**Architecture**
native/prism-wasm/Cargo.toml, scripts/build-prism-wasm.mjs, src/renderer/vendor/prism/, .gitignore.

**Key decisions**
- Keep developing the DSP in the SpectralPrism repo, but make the app's build pin the exact source explicitly.

**Alternatives considered**
- Path dependency as-is (rejected: silently breaks on a fresh clone / CI).
- Fully reimplementing the DSP in TS (rejected: duplicates a mature Rust engine already wired through the worker).

**Open questions**
- Vendor vs submodule vs path+revision; who owns rebuilding the WASM artifact when the crate changes?

**Acceptance criteria**
- A fresh clone can rebuild a working engine and the steps are documented on this card.

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

### FEAT-13 — Structural Loop Length modulation for SpectralPrism
- priority: medium
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, modulation, structural, prism_dsp
- created: 2026-09-17
- updated: 2026-09-17

Follow-up split out of FEAT-2/FEAT-3. The modulation plan listed Loop Length as a modulatable target, but Loop Length is **structural**: it changes `num_hops`/`out_len` and cannot vary within one rendered buffer. `prism_dsp/src/modulate.rs` deliberately documents it as not handled, and the TS `SPECTRAL_PARAMS` registry omits it, so the shipped modulation matrix covers 13 resynthesis/analysis-time targets and excludes Loop Length.

**Approach options to decide before building**
- Tile/crossfade renders of different loop lengths (keeps a phase-locked period but the seam between lengths is the hard part).
- Apply Loop Length as a playback-time loop-length envelope in the sampler instead of baking it into the render.

**Why separate**
Structural modulation has different acceptance criteria (loop period/click-freedom across a *changing* period) and would otherwise block the rest of the modulation track, which is verified and implemented.

**Acceptance criteria**
- A documented decision on tiling vs playback-time envelope.
- If baked: cargo tests prove click-freedom and periodicity across a loop-length sweep.
- If playback-time: the sampler applies the envelope without re-rendering.

## Bugs

## In Progress

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

## Blocked

## Implemented

### FEAT-8 — Percussion synthesis in prism_dsp (render_percussion)
- priority: high
- tags: plan-spectralprism-offline-modulation-percussion-synthesis, spectral, percussion, prism_dsp, rust, dsp
- created: 2026-09-17
- updated: 2026-09-17
- plan: spectralprism-offline-modulation-percussion-synthesis
- kind: card
- parent: FEAT-1

**Decision (2026-09-17, from John):** Percussion is a **third pipeline step**, activated for *any* Fusion Mode, that applies percussion parameters to the **output of the Fusion stage**. It is not a Fusion mode itself, not a separate instrument type. Pipeline: `Sample A freeze/resynth → Fusion(mode, A+B) → Percussion post-stage → one-shot buffer`.

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
