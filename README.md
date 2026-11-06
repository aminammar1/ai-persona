npx skills add aminammar1/ai-persona

# ai-persona

Your AI coding agent, adapted to you. ai-persona uses small prompt-driven persona states and per-project profiles while leaving each agent's built-in tools, modes, and permissions in control.

Your AI coding agent, adapted to you. Prompt-driven persona states, enforced standing orders, and per-project memory for OpenCode, Claude Code and Codex.

The first scaffold includes four Agent Skills plus Claude Code and Codex plugin manifests. Runtime hooks, MCP tools, and memory are not implemented yet.

Claude Code marketplace install: `claude plugin marketplace add aminammar1/ai-persona`, then `claude plugin install ai-persona@ai-persona-marketplace`.

## Skills

- `persona-init`: create a project profile and connect the current agent adapter.
- `persona-mode`: show or switch the current state.
- `persona-rules`: add a confirmed standing order.
- `persona-learn`: review suggested profile changes.

See [docs/agent-hooks.md](docs/agent-hooks.md) for the hook sets verified from the current official Claude Code and Codex documentation.
