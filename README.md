# SpectralPrism Tracker

<img width="2550" height="1420" alt="image" src="https://github.com/user-attachments/assets/82a8212f-aed7-4936-8cc9-230190765370" />

--

_A four-channel terminal-based music tracker, bespoke for my workflow. 
It plays and edits sample-based instruments with an optional Spectral / Percussion / Chord / MicroTextures chain, a mixer with master delay, reverb and optional GBA-style downsampler. A `/cycles` mode is available for de-synced channels, for polymetric fun!_

--

## Requirements

- [Node.js](https://nodejs.org/) **22 or newer** (includes `npm`)
- A modern terminal (Windows Terminal, macOS Terminal, or any common Linux
  terminal)

No Rust toolchain is needed for normal use — the Prism DSP WASM is already
vendored in the repository.

## Download

```bash
git clone https://github.com/johnoestmannmusic/SpectralPrismTracker.git
cd SpectralPrismTracker
npm install
```

## Run the desktop TUI

Build and launch in one step:

```bash
npm run dev:tui
```

Or build into an executable bundle:

```bash
npm run build:dist
```

Once it is running, press `/` for the command palette, `?` for help, `Space` to
play, and `/quit` (or `/exit`) to leave.


## Changing the Source Sample sounds

Replace the `.ogg` files in `assets/SourceSamples/` with your own (with filenames starting with numbers 0-5). These are read in automatically by the program as the source material.

_The `.oggs` included in this repository are from my Mechsounds sound pack: https://johnoestmannmusic.com/mechsounds/_


## Other Tips

- `/viewsource` inside the app opens the source repository.
- `/stepthrough` walks through rebuilding the loaded project step by step.


## AI Disclosure

_This software was developed with AI programming assistance. For more info on my current stance, please read https://johnoestmannmusic.com/ai-building-exoskeletons/_
