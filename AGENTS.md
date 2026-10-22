# project-management

Self-hosted, MIT-licensed project management tool for agent-driven development. Stack, scope and decisions live in the Memory Bank (`memory-bank/`).

## Planning

- Run a Claude Design pass before writing an implementation plan that adds or reshapes UI: new screens, navigation, layout, or visual direction. Build the plan on the design output.
- Skip the pass for backend, CLI or infrastructure work, and for UI work that only reuses existing screens and components. The plan states why it was skipped.
- The Claude Design prompt is self-contained: product context, screens and their states, constraints (the UI stack recorded in the Memory Bank, light and dark themes), the assets to upload, and the hand-off format expected back. Claude Design cannot read this repo.
- Keep the brief and the exported design under `.agent/design/<milestone>/`. Plans and implementing agents link to it there.
