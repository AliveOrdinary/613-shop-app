---
description: Run lint, typecheck and tests; summarize failures without fixing anything
allowed-tools: Bash(npm run lint), Bash(npm run typecheck), Bash(npm test)
---

Run `npm run lint`, `npm run typecheck` and `npm test`. Run all three, even if one fails.

Then report:

- Each command: passed or failed.
- Each failure: file and line, the error in one line, and the likely cause if it's obvious.

Don't change any files and don't fix anything yet. Wait for me to say what to fix.
