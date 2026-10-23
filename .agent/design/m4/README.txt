M4 screens (cross-project dashboard), direction 2a Ledger.
Claude Design project: https://claude.ai/design/p/6fd73234-e02d-4621-95b6-528007298671?file=M4+Screens.dc.html
Brief: brief.md.
source/ledger.css and source/ledger-m2.css are unchanged copies. source/ledger-m4.css adds the dashboard component styles and no new colour tokens; it loads after the other two.
To open the canvas locally, serve source/ over HTTP (python3 -m http.server) and open "M4 Screens.dc.html". M4Frame.dc.html?state=<state>&theme=<light|dark>[&width=1024][&c=kit] shows one frame.
screens/ holds a PNG of every frame on the canvas, numbered in canvas order: <n>-<section>-<component>-<theme>-<state>.png.
Design calls and open questions are listed at the top of the canvas.
