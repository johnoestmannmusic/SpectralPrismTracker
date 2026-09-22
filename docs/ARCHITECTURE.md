# Architecture

SpectralPrism Tracker's web deployment is a purely static, client-side app: a
plain file host serves the bundle once per page load, and each visitor's browser
runs its own `Session`, host, and terminal with no shared process or state
(HC005, target of FEAT-173…184). The desktop app shares the same `src/core` and
TUI code and runs the same Ink UI directly against a real terminal (HC003).

```mermaid
flowchart LR
    Host["Static file host<br/>(serves bundle + assets + WASM)"]

    subgraph A["Visitor A's browser — independent"]
        SA["Session + browserHost"]
        IA["Ink App → local xterm"]
        SA --> IA
    end
    subgraph B["Visitor B's browser — independent"]
        SB["Session + browserHost"]
        IB["Ink App → local xterm"]
        SB --> IB
    end

    Host -->|"HTTP: JS / assets / WASM"| A
    Host -->|"HTTP: JS / assets / WASM"| B
```