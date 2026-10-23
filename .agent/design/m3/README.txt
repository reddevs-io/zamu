M3 screens (Backlog.md mirror and import), direction 2a Ledger.
Claude Design project: https://claude.ai/design/p/6fd73234-e02d-4621-95b6-528007298671?file=M3+Screens.dc.html
Brief: brief.md.
source/ledger.css and source/ledger-m2.css are the M1 and M2 token files, unchanged. source/ledger-m3.css adds three tokens (--sys-bg/--sys-fg, --hatch, --src-bg) and the M3 component styles; it loads after them.
To open the canvas locally, serve source/ over HTTP (python3 -m http.server) and open "M3 Screens.dc.html".
screens/ holds a PNG of every frame on the canvas, numbered in canvas order: <n>-<frame id>-<component>-<theme>-<state>.png.
The calls made on the brief, the open questions and the pm error text for agents are at the top of the canvas.
