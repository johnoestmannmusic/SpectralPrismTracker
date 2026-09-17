# prism_dsp source (vendored)

The Spectral engine is built from a **vendored copy** of SpectralPrism's
`prism_dsp` crate, so the app is self-contained: no sibling checkout is needed
for a fresh clone or CI.

- Vendored sources: `native/prism_dsp/` (checked in).
- Manifest: `native/prism_dsp/Cargo.toml` is standalone (`realfft = "3.5"`).
- `native/prism-wasm/Cargo.toml` points at it: `prism_dsp = { path = "../prism_dsp" }`.
- Generated WASM is copied into `src/renderer/vendor/prism/`.

## The DSP is developed upstream

`modulate.rs` (offline modulation) and `percussion.rs` (post-fusion percussion)
are developed in the **SpectralPrism** repo (`crates/prism_dsp`). This vendored
copy must not be edited by hand.

## Re-vendor

```sh
node scripts/vendor-prism-dsp.mjs /path/to/SpectralPrism/crates/prism_dsp
npm run build:prism-wasm
```

`scripts/vendor-prism-dsp.mjs` copies `src/` + `LICENSE`, writes a standalone
manifest, and stamps the upstream version. Run it whenever the upstream DSP
changes, then rebuild the WASM and commit both `native/prism_dsp/` and the
regenerated `src/renderer/vendor/prism/` artifacts.

## Options considered

- **Vendoring (chosen).** Self-contained and reproducible; cost is remembering
  to re-vendor after upstream DSP changes.
- **Sibling path + recorded revision.** Less duplication, but a fresh clone/CI
  needs the external checkout and can silently pick a different revision.
- **Git submodule.** Reproducible, but adds submodule friction for contributors
  who only want the app.
