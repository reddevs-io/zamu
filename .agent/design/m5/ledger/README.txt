M5 screens (labels, due dates, blocked by, subtasks), direction 2a Ledger.
Claude Design project: https://claude.ai/design/p/6fd73234-e02d-4621-95b6-528007298671?file=M5+Screens.dc.html
Brief: brief.md. The shared spec the screens were built from (fixed data, layout rules, shortcuts): source/spec.md.
source/ledger.css, ledger-m2.css, ledger-m3.css and ledger-m4.css are unchanged copies. source/ledger-m5.css adds the label palette (nine --lb-* tokens, the only new tokens, with contrast checks in its header) and every M5 component class; it loads after the others.
To open the canvas locally, serve source/ over HTTP (python3 -m http.server) and open "M5 Screens.dc.html". M5Frame.dc.html?c=<kit|panel|rel|list|my|board|dash|labels>&state=<state>&theme=<light|dark>[&width=1024] shows one frame.
screens/ holds a PNG of every frame on the canvas, numbered in canvas order: <n>-<frame id>-<component>-<theme>-<state>[-1024].png.
Component inventory and the shortcut list: frames 0a and 0b (M5Kit). Design calls and open questions are at the top of the canvas.
