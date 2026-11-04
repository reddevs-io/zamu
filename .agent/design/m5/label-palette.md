# Label palette and contrast checks

Nine label hues, one value per theme. A label always shows as a 7px dot beside its name, so the colour is never the only signal. The dot still has to stand out from what's behind it: we hold every hue to **3:1 against the page, cards and the chip background**, the WCAG 1.4.11 minimum for non-text graphics. The first six hues also fill the project tiles, and the tile letter has to pass **4.5:1**.

Tokens are `--label-1` to `--label-9` in `tokens.css`. The design source calls them `--lb1` to `--lb9`.

## Changed after the design pass

The first check found four failures in light mode, all fixed in `tokens.css`, the source and the screens:

| Token | Was | Now | Why |
|---|---|---|---|
| `--label-6` (amber) | `oklch(0.7 0.13 75)` | `oklch(0.62 0.13 70)` | 2.43–2.70:1 against the backgrounds |
| `--label-9` (olive) | `oklch(0.64 0.12 115)` | `oklch(0.6 0.12 120)` | 2.93:1 against the chip background |
| `--tile-ink` | `oklch(0.99 0 0)` | `oklch(0.14 0.01 60)` | white letters on tiles were 2.65–4.2:1 |
| `--fg-3` | `oklch(0.55 0.012 60)` | `oklch(0.52 0.012 60)` | 4.21:1 on `bg-lane`, which highlighted menu rows sit on |

Dark mode passed as it was.

## Results

Ratios are WCAG 2 contrast. Colours are converted from OKLCH to sRGB and clipped to the sRGB gamut. "Chip bg" is `bg-grp`, the label chip's background.

### Light

| Label | OKLCH | Hex | vs bg | vs surface | vs chip bg (bg-grp) |
|---|---|---|---|---|---|
| label-1 | `oklch(0.62 0.13 250)` | `#418ad1` | 3.38 | 3.60 | 3.23 |
| label-2 | `oklch(0.6 0.12 150)` | `#439458` | 3.48 | 3.71 | 3.33 |
| label-3 | `oklch(0.6 0.14 300)` | `#8e6ac7` | 3.88 | 4.14 | 3.72 |
| label-4 | `oklch(0.6 0.17 27)` | `#d24d45` | 3.99 | 4.25 | 3.81 |
| label-5 | `oklch(0.62 0.1 215)` | `#2695ac` | 3.27 | 3.48 | 3.13 |
| label-6 | `oklch(0.62 0.13 70)` | `#b77610` | 3.48 | 3.71 | 3.33 |
| label-7 | `oklch(0.62 0.15 345)` | `#c35c9b` | 3.67 | 3.91 | 3.51 |
| label-8 | `oklch(0.62 0.1 185)` | `#26998e` | 3.23 | 3.44 | 3.09 |
| label-9 | `oklch(0.6 0.12 120)` | `#778a2d` | 3.57 | 3.80 | 3.42 |

| Pair | Ratio | AA |
|---|---|---|
| `fg` on `bg` | 14.93 | pass |
| `fg` on `surface` | 15.91 | pass |
| `fg-2` on `bg` | 6.95 | pass |
| `fg-2` on `surface` | 7.41 | pass |
| `fg-3` on `bg` | 5.14 | pass |
| `fg-3` on `surface` | 5.48 | pass |
| `fg-3` on `bg-lane` | 4.77 | pass |
| `accent-text` on `bg` | 7.30 | pass |
| `accent-ink` on `accent` | 8.29 | pass |
| `danger` on `bg` | 5.19 | pass |
| `danger` on `danger-soft` | 4.74 | pass |
| `ok` on `ok-soft` | 4.55 | pass |
| `accent-text` on `accent-soft` | 6.58 | pass |
| `tile-ink` on `label-1` | 5.49 | pass |
| `tile-ink` on `label-2` | 5.32 | pass |
| `tile-ink` on `label-3` | 4.77 | pass |
| `tile-ink` on `label-4` | 4.65 | pass |
| `tile-ink` on `label-5` | 5.67 | pass |
| `tile-ink` on `label-6` | 5.32 | pass |
| `fg-3` on `bg-grp` | 4.92 | pass |
| `fg-2` on `bg-lane` | 6.45 | pass |
| `fg-2` on `kbd-bg` | 6.08 | pass |

### Dark

| Label | OKLCH | Hex | vs bg | vs surface | vs chip bg (bg-grp) |
|---|---|---|---|---|---|
| label-1 | `oklch(0.72 0.12 250)` | `#67aaed` | 7.27 | 6.27 | 6.89 |
| label-2 | `oklch(0.72 0.12 150)` | `#69ba7c` | 7.59 | 6.55 | 7.19 |
| label-3 | `oklch(0.72 0.12 300)` | `#b093e5` | 6.94 | 5.99 | 6.58 |
| label-4 | `oklch(0.72 0.14 27)` | `#ef7f74` | 6.81 | 5.88 | 6.46 |
| label-5 | `oklch(0.74 0.09 215)` | `#61b9ce` | 8.01 | 6.91 | 7.59 |
| label-6 | `oklch(0.8 0.12 75)` | `#ebb25f` | 9.46 | 8.16 | 8.96 |
| label-7 | `oklch(0.72 0.13 345)` | `#de82b7` | 6.79 | 5.86 | 6.44 |
| label-8 | `oklch(0.74 0.09 185)` | `#61bdb2` | 8.09 | 6.98 | 7.67 |
| label-9 | `oklch(0.76 0.11 115)` | `#afb965` | 8.52 | 7.35 | 8.08 |

| Pair | Ratio | AA |
|---|---|---|
| `fg` on `bg` | 14.81 | pass |
| `fg` on `surface` | 12.78 | pass |
| `fg-2` on `bg` | 8.35 | pass |
| `fg-2` on `surface` | 7.20 | pass |
| `fg-3` on `bg` | 5.33 | pass |
| `fg-3` on `surface` | 4.60 | pass |
| `fg-3` on `bg-lane` | 5.05 | pass |
| `accent-text` on `bg` | 9.58 | pass |
| `accent-ink` on `accent` | 9.68 | pass |
| `danger` on `bg` | 6.77 | pass |
| `danger` on `danger-soft` | 4.94 | pass |
| `ok` on `ok-soft` | 6.10 | pass |
| `accent-text` on `accent-soft` | 6.79 | pass |
| `tile-ink` on `label-1` | 7.62 | pass |
| `tile-ink` on `label-2` | 7.96 | pass |
| `tile-ink` on `label-3` | 7.28 | pass |
| `tile-ink` on `label-4` | 7.14 | pass |
| `tile-ink` on `label-5` | 8.40 | pass |
| `tile-ink` on `label-6` | 9.92 | pass |
| `fg-3` on `bg-grp` | 5.05 | pass |
| `fg-2` on `bg-lane` | 7.92 | pass |
| `fg-2` on `kbd-bg` | 6.36 | pass |

Re-run the checks with `python3 round2/contrast.py round2/source/r2/margin.css`.
