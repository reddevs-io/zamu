# M5 design: redesign and native task fields

Claude Design pass for M5 (0.7.0). Direction **1c Margin**, every screen of the brief, light and dark.

- **Canvas** (now on claude.ai): https://claude.ai/artifact/Qf4nELj16FMAKRzSWei9z5. Round 2 is the page `r2/Round 2 · Margin`.
- The old Claude Design link (`claude.ai/design/p/2f90b016-…`) moved to the canvas above.

## What's here

| Path | What it is |
|---|---|
| `brief.md` | The brief sent to Claude Design (both rounds) |
| `assets/before-board-dark.png` | The finanno board that started the redesign ("overwhelming") |
| `round1/` | Round 1: three directions × board, display options, list, task view, 1024px, tokens (PNGs + README.txt) |
| `round2/screens/` | Round 2: 130 PNGs, every frame of the canvas in order |
| `round2/source/` | The canvas sources: `.dc.html` per screen group, `margin.css`, `screens.css`, `data.js`, `support.js` |
| `round2/contrast.py` | Recomputes the contrast tables in `label-palette.md` |
| `tokens.css` | **Design tokens for the build**: type, spacing, radius, colour (OKLCH, light and dark), elevation |
| `label-palette.md` | The nine label hues with contrast checks, and the fixes made after the pass |
| `components.md` | Component inventory: every component, its states, and the frames that show it |
| `shortcuts.md` | The full shortcut list, with conflicts resolved |
| `notes.md` | Changes to the brief, calls made in the design, open questions |
| `ledger/` | The superseded Ledger M5 export, kept for reference |

## Screen names

`<n>-<section>-<component>-<theme>-<state>[-1024|-1280].png`, numbered in canvas order: each section's light frames come first, then its dark frames.

| Frames | Section |
|---|---|
| 001–002 | Kit |
| 003–010 | Shell and sidebar (workspace switcher, person menu, collapsed at 1024) |
| 011–028 | Project list (status, label, filters, multi-select, long titles, empty, no results, loading, error) |
| 029–044 | Board (default, everything set, swimlanes, subtasks expanded, subtasks as cards, collapsed column, drag, empty column) |
| 045–050 | Display options and Filter |
| 051–066 | Task view (full, 1280, empty, mirrored, From the file, long, 40 activity items, composer) |
| 067–070 | Peek |
| 071–088 | Pickers (labels ×3, due, blocker, subtask, assignee, status, priority) |
| 089–096 | Command palette |
| 097–098 | Quick create |
| 099–106 | Home (Mine, Everyone, Agents, all clear) |
| 107–114 | Milestones and cycles |
| 115–126 | Project settings, Labels |
| 127–130 | Project settings form and sign-in |

## Opening the sources locally

The pages load their parts with `fetch`, so serve the folder instead of opening the files directly:

```sh
cd .agent/design/m5/round2/source && python3 -m http.server 8000
# canvas:     http://localhost:8000/r2/Round%202%20%C2%B7%20Margin.dc.html
# one frame:  http://localhost:8000/r2/_Harness.dc.html#task-dark-full   (#<file>-<theme>-<state>[-narrow])
```

Harness file keys: `kit`, `board`, `list`, `task`, `over` (peek, pickers, palette, quick create), `home`, `plan`, `set` (labels, forms, sign-in). The states are listed in each file's `data-props`.
