# Vendored prism_dsp

Copied from the SpectralPrism repo's `crates/prism_dsp` by
`scripts/vendor-prism-dsp.mjs`. **Do not edit these sources here** — the DSP is
developed in SpectralPrism, then re-vendored:

```sh
node scripts/vendor-prism-dsp.mjs /path/to/SpectralPrism/crates/prism_dsp
npm run build:prism-wasm
```

`native/prism-wasm/Cargo.toml` points at this directory, so the app builds the
Spectral engine without any external checkout.
