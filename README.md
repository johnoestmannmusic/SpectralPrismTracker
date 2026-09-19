# SpectralPrism Tracker

<img width="2550" height="1420" alt="image" src="https://github.com/user-attachments/assets/82a8212f-aed7-4936-8cc9-230190765370" />

--

_A four-channel terminal-based music tracker, bespoke for my workflow. 
It plays and edits sample-based instruments with an optional Spectral / Percussion / Chord / MicroTextures chain, a mixer with master delay, reverb and optional GBA-style downsampler. A `/cycles` mode is available for de-synced channels, for polymetric fun!_

--

It ships as two front ends built from one code base:

- a **desktop TUI** (the main app), and
- a **web version** that streams the same TUI into an xterm.js frame in the
  browser.

Projects are `.sptproj` files.

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

Or build once and start it separately:

```bash
npm run build:tui
npm run start:tui
```

To get a global `spt` command, run `npm link` after building, then start it with
`spt`.

Once it is running, press `/` for the command palette, `?` for help, `Space` to
play, and `/quit` (or `/exit`) to leave.

## Run the web version

```bash
npm run build:web
npm run serve:web
```

Then open <http://127.0.0.1:8123> in your browser. The web host runs the same TUI
and streams it to the page; audio plays on the machine running the host.

The web build has no filesystem access, so commands such as `/open`, `/save`
and `/restore` show a notice instead. Use the **Download WAV** button to grab
the demo WAV placed in `assets/WAVExport/`.


## Changing the Source Sample sounds

Replace the `.ogg` files in `assets/SourceSamples/` with your own (with filenames starting with numbers 0-5). These are read in automatically by the program as the source material.

_The `.oggs` included in this repository are from my Mechsounds sound pack: https://johnoestmannmusic.com/mechsounds/_


## Web-hosted version defaults

The Web version of this program has a `Download WAV` button, which simply reads and downloads the `.wav` file that is in `assets/WAVExport`

The Web version also reads in `assets/lmp-default-proj.sptproj` by default. This is to keep everything bundled and limit dynamic filereads on web servers.


## Other Tips

- `/viewsource` inside the app opens the source repository.
- `/stepthrough` walks through rebuilding the loaded project step by step.


## AI Disclosure

_This software was developed with AI programming assistance. For more info on my current stance, please read https://johnoestmannmusic.com/ai-building-exoskeletons/_
