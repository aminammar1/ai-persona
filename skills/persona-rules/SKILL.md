---
name: persona-rules
description: Add a standing order in the developer's own words.
---

Parse one requested order, such as “don't commit”, “don't push”, “don't touch these paths”, or “use this MCP”. Use `propose_guard` for supported rules, show the parsed rule once, and ask the developer to confirm. Call `confirm_guard` only after an explicit yes; reject it after a no. Never activate a rule without confirmation. Don't claim a guard blocks tool calls unless the current agent has a verified pre-tool hook wired to `checkGuard`.
