---
name: persona-init
description: Set up ai-persona for the current project and coding agent.
---

Scan the project and identify its stack. Show the developer a proposed `profile.md` based on `templates/profile.md` and ask permission before writing it or changing agent configuration. After approval, register only the adapter and MCP server supported by the current agent. Preserve its built-in tools, modes, and permissions; report any missing hook instead of pretending it exists.
