# Reachability map (HC002)

Constraint **HC002**: _all menus and parameters must be reachable within 2 button
presses_. This document is the contract; `tests/unit/reachability.test.ts`
enforces that every entry below costs at most two presses and that every TUI
overlay is listed.

A "press" is one key press from the main tracker screen. The command palette is
counted as: `/` (or `:`) opens it = press 1, then `Enter` runs the highlighted
suggestion = press 2.

| Target                        | Path from the main screen                      | Presses |
| ----------------------------- | ---------------------------------------------- | ------- |
| `overlay:mixer`               | `/` → `Enter` on `mixer`                       | 2       |
| `overlay:samples`             | `/` → `Enter` on `sourcesamples`               | 2       |
| `overlay:instruments`         | `I`                                            | 1       |
| `overlay:patterns`            | `/` → `Enter` on `patterns`                    | 2       |
| `overlay:stepthrough`         | `/` → `Enter` on `stepthrough`                 | 2       |
| `overlay:sampler`             | `v` (mode-aware instrument editor)             | 1       |
| `overlay:spectral`            | `v` then tab to Spectral                       | 2       |
| `overlay:percussion`          | `v` then tab to Percussion                     | 2       |
| `overlay:chord`               | `v` then tab to Chord                          | 2       |
| `overlay:microtextures`       | `v` then tab to MicroTx                        | 2       |
| `overlay:wav`                 | `/` → `Enter` on `export wav`                  | 2       |
| `overlay:fx`                  | `/` → `Enter` on `fx`                          | 2       |
| `menu:help`                   | `?`                                            | 1       |
| `menu:song-info`              | `/` → `Enter` on `info`                        | 2       |
| `menu:context-cell`           | `Enter` on the cursor cell                     | 1       |
| `menu:context-instrument`     | `Enter` on an instrument row                   | 1       |
| `menu:context-order`          | `Enter` on an order/pattern row                | 1       |
| `menu:order-picker`           | `o`                                            | 1       |
| `palette:commands`            | `/` or `:`                                     | 1       |
| `transport:play-stop`         | `Space`                                        | 1       |
| `transport:loop`              | `L`                                            | 1       |
| `edit:undo`                   | `Ctrl+Z`                                       | 1       |
| `edit:redo`                   | `Ctrl+Y`                                       | 1       |
| `file:save`                   | `Ctrl+S`                                       | 1       |
| `param-group:instrument-tabs` | `v` → `Tab` cycles Sampler/Spectral/Percussion | 2       |
| `param-group:mixer-channels`  | `/` → `Enter` on `mixer`, then arrows          | 2       |
| `param-group:master-fx`       | `/` → `Enter` on `fx`, then arrows             | 2       |
| `mode:cycles`                 | `C` or `/` → `Enter` on `cycles`               | 2       |
| `view:ghosting`               | `/` → `Enter` on `ghosting`                    | 2       |

Everything else (tracker editing, selection, transpose, interpolation) is a
direct key on the main screen (press 1) and needs no menu.
