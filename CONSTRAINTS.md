# CONSTRAINTS.md

<!--
  CONSTRAINTS.md declares what this project is trying to achieve and the rules
  around it. The constraints-validate extension reads this file:
    - before planning a new feature (tool: constraints_check)
    - after implementing, before work is marked done (tool: constraints_validate)
    - while writing/editing files, so blocking violations are stopped immediately

  Write four sections:

      ## Goals            (G001, G002, ...)   what the project is for
      ## Hard Constraints  (HC001, HC002, ...) rules that must never be broken (blocking)
      ## Soft Constraints  (SC001, SC002, ...) strong preferences (warnings)
      ## Stretch Goals     (SG001, SG002, ...) nice-to-haves (informational)

  Each item is one line, "ID: description":

      HC001: Images must be exactly 240x240 pixels

  Machine checks may follow an item on the next lines (until the next item):

      Why: Explain why the rule exists so future changes respect its intent.
      Files: src/**/*.ts            (scope; default is all files)
      Except: src/config/**         (files to ignore)

      Must not contain: process.env.          (fails if any file in scope has it)
      Must contain: Copyright                (at least one file in scope has it)
      Every file must contain: Copyright     (all files in scope have it)
      Must exist: LICENSE                    (this file must exist)
      Must not exist: src/legacy/**          (no file may match this)
      Run: npm test                          (the command must exit 0)

  Text is matched literally, so "process.env." means exactly that. Wrap text in
  slashes for a regular expression: /process\.env\.[A-Z]+/i
-->

## Goals

G001: Create a TUI 4-channel tracker that makes my entire compositional workflow transparent to the end-user, and speeds up my compositional process.

## Hard Constraints

HC001: Must be a TUI (the web-deployed version will be a TUI inside a frame with some extra non TUI buttons)
Why: The TUI is the product; the web frame may only add non-TUI chrome around it.
Must exist: src/tui/App.tsx
Run: npm run build:tui

HC002: All menus and parameters must be reachable within 2 button presses
Why: The tracker must stay fast and discoverable; nothing may be buried behind long navigation.
Run: npx vitest run tests/unit/reachability.test.ts

HC003: Must work cross-platform, both as a desktop app, and web-deployed app
Why: The same TUI ships as the `lantern` desktop binary and as the streamed web host + xterm frame.
Must exist: src/web/main.tsx
Must exist: src/web/server.tsx
Run: npm run build:web

HC004: Any additional packages must be checked against typosquatting and other security vulnerabilities
Why: Slopsquatting is the main supply-chain risk for an AI-assisted project.
Run: npm run audit:deps -- --offline

## Soft Constraints

SC001: TypeScript as the language
Why: Keeps the domain, hosts and UI type-safe and testable.
Must not exist: src/tui/**/\*.js
Must not exist: src/core/**/_.js
Must not exist: src/host/\**/_.js
Must not exist: src/web/**/\*.js
Must not exist: src/runtime/**/*.js
Must exist: tsconfig.json

## Stretch Goals
