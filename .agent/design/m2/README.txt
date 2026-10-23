M2 screens (work views), direction 2a Ledger.
Claude Design project: https://claude.ai/design/p/6fd73234-e02d-4621-95b6-528007298671?file=M2+Screens.dc.html
Brief: brief.md.
source/ledger.css is the M1 token file, unchanged. source/ledger-m2.css adds the M2 tokens and component styles and loads after it.
To open the canvas locally, serve source/ over HTTP (python3 -m http.server) and open "M2 Screens.dc.html".
screens/ holds a PNG of every frame on the canvas, numbered in canvas order: <n>-<section>-<component>-<theme>-<state>.png.
Open questions are listed at the top of the canvas.
