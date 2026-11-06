---
name: persona-init
description: Set up ai-persona for the current project and coding agent.
---

Scan the project and identify its stack. Read the bundled `references/profile-template.md`, prepare a project specific `profile.md`, and show it to the developer. Ask permission before writing the profile, fetching the runtime, installing dependencies, or changing agent configuration. After approval, locate `scripts/setup.mjs` beside this skill and run it with the current project path and agent name, plus `--approved`. The installer fetches the runtime over SSH, installs its dependencies, and registers the supported adapter and MCP server for OpenCode, Claude Code, or Codex. Confirm that setup succeeded before saying the adapter is active.

For Codex, inspect `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) before setup. Current Codex uses `[features].hooks`; `codex_hooks` is a deprecated alias. Warn when the effective hooks flag is off, including when managed policy disables it. After setup, have the developer review and trust the hooks in `/hooks`. If hooks remain off or untrusted, say the adapter is inactive and do not imply that guards ran.
