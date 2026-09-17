# Project Kanban

<!-- Source of truth for project coordination. Managed by the KANBAN-MANAGE tool; safe to edit by hand. -->

## Features

### FEAT-17 — Terminal Lantern — TUI migration
- priority: critical
- tags: plan-terminal-lantern-tui-migration, epic
- created: 2026-09-17
- updated: 2026-09-17
- plan: terminal-lantern-tui-migration
- kind: epic

**Plan summary**
Convert the Electron/React Lantern Music Player into a terminal app on Node + TypeScript + Ink. Strategy: keep the framework-agnostic domain layer (src/core: .fur parser, songModel, tracker edit ops, project JSON, DSP/spectral/percussion, export) and the existing vitest unit tests untouched; swap only the shell (Electron+React DOM → Ink TUI), the file-dialog layer (Electron IPC → Node fs + path-completion), the audio host (browser Web Audio → node-web-audio-api), and the worker host (Web Worker → node worker_threads). The TUI shows a persistent tracker pattern view plus a song title/info header, and every action is reachable through a slash-command bar with fuzzy suggestions and Tab auto-completion. First milestone is Core scope: playback, persistent tracker, song info, file/project IO, mixer/transport. Graph-heavy editors (spectral/percussion modulation, sampler, master FX, cover art) are deferred to a later parity phase.

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
`npm run dev:tui` builds and runs the terminal app. All cards on this plan are Implemented: FEAT-18 Node runtime/IO, FEAT-19 node-web-audio-api shim, FEAT-20 prism worker thread, FEAT-21 Ink shell (persistent tracker + song info), FEAT-22 slash-command engine (fuzzy + Tab), FEAT-23 tracker editing (selection/clipboard/transpose/order ops), FEAT-24 transport, FEAT-25 mixer overlay, FEAT-26 open/new/export, FEAT-27 sample browser + waveform, FEAT-28 packaging, FEAT-29 tests, FEAT-30 Electron/React-DOM removal, FEAT-31 sampler/spectral/percussion/master-FX editors + headless cover art, FEAT-32 live control socket + `.lmpscript` runner. Verified by 23 test files / 144 tests, a real control-socket E2E (`examples/control-smoke.lmpscript`) and an interactive pty smoke. Remaining possible future work: FEAT-15 (mecha/power-suit cover *designer*, archived) and deeper modulation-route authoring in the TUI.

## Bugs

## In Progress

## Blocked

## Implemented

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

**Cause:** terminals send NUL (0x00) for Ctrl+Space, and Ink's key parser maps `\x00` through its ctrl+letter branch (`name = charCode + 96`), so it arrives as ``` ` ``` with `key.ctrl = true` — never as a space or NUL char.

**Fix:** App now treats `key.ctrl && (char === " " || char === "\`")` as Ctrl+Space and calls `Session.playFromCursor()`. Verified via the control socket: cursor at row 8 → playing true, clock at 2.1s (i.e. started from row 8). Unit test added.

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

**Cause:** `moveCursor`/`setCursor` explicitly disabled `follow`, and `editCell` advances the cursor via `moveCursor`, so every note entry or cursor move killed follow. Follow also moved the *cursor* rather than the view.

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
`ParamEditorOverlay.tsx` is a reusable keyboard-driven editor (↑↓ select, ←→ adjust, enter/p preview, `[`/`]` instrument, esc close) fed by `src/tui/editors.tsx`: sampler (source/trim/ADSR + envelope sparkline/tuning/vibrato/polyphony), spectral (enable/mode/sources/mix), percussion (presets + noise/transient/pitch/body/character), and master FX (delay+reverb). `/sampler`, `/spectral`, `/percussion`, `/fx` open them. `Session.updateSamplerSetting` mirrors the GUI's re-render/re-trim logic and `Session.previewAfterRender` is the FEAT-16 preview-on-adjust (350ms debounce). Cover art is now headless: `src/core/coverArt.ts` ports the procedural 32×32+4×4-Bayer scene, `src/runtime/cover.ts` adds a zlib PNG encoder, and `/export png` (plus WAV artwork embedding) uses it. Remaining out of scope: the FEAT-15 mecha/power-suit *part designer* (archived) and interactive modulation-route editing (routes are shown read-only; author via project JSON).

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

## Archived

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
