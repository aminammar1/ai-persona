---
name: persona-init
description: Set up ai-persona for the current project and coding agent.
---

Scan the project and identify its stack. Show the developer a proposed `profile.md` based on `templates/profile.md` and ask permission before writing it or changing agent configuration. After approval, register only the adapter and MCP server supported by the current agent. If hook dependencies are missing, ask before installing them. Preserve built-in tools, modes, and permissions; report any missing hook instead of pretending it exists.

For Codex, inspect `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) before setup. Current Codex uses `[features].hooks`; `codex_hooks` is a deprecated alias. Warn when the effective hooks flag is off, including when managed policy disables it. Ask explicit permission before changing Codex configuration or installing hook dependencies. After approval, wire the plugin's declared `hooks/codex-hooks.json`, then have the developer review and trust the hooks in `/hooks`. If hooks remain off or untrusted, say the adapter is inactive and do not imply that guards ran.
