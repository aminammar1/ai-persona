npx skills add aminammar1/ai-persona

# ai-persona

Your AI coding agent, adapted to you. ai-persona uses small prompt-driven persona states and per-project profiles while leaving each agent's built-in tools, modes, and permissions in control.

Your AI coding agent, adapted to you. Prompt-driven persona states, enforced standing orders, and per-project memory for OpenCode, Claude Code and Codex.

The shared TypeScript core provides profile loading, state detection, dials, last-state persistence, and a project-local SQLite memory store. The MCP server exposes the persona tools over stdio. Agent-specific hooks are not wired yet.

Claude Code marketplace install: `claude plugin marketplace add aminammar1/ai-persona`, then `claude plugin install ai-persona@ai-persona-marketplace`.

## Skills

- `persona-init`: create a project profile and connect the current agent adapter.
- `persona-mode`: show or switch the current state.
- `persona-rules`: add a confirmed standing order.
- `persona-learn`: review suggested profile changes.

See [docs/agent-hooks.md](docs/agent-hooks.md) for the hook sets verified from the current official Claude Code and Codex documentation.

## Core

The agent-neutral core is in [`core/`](core/). `processPrompt()` classifies each prompt, returns state-adjusted dials, emits a short hint only on state changes, and persists the last state under `.ai-persona/state.json`. Copy and customize [`templates/profile.md`](templates/profile.md) as `profile.md` in a project. Pass only the relevant headings and split files to `loadProfile()` for task-specific context.

The MCP runtime requires Node.js 22.13 or newer. Install dependencies with `npm install`, then start it from a project root with `npm run mcp`. Its SQLite file is `.ai-persona/memory.sqlite`; it stores concise decisions, corrections, open problems, and pending suggestions, never transcripts. `get_persona` returns the current project's profile slice and at most three short memory notes. Compaction adapters call `recordCompactionSummary()` with structured notes; adapter hooks are a later build stage. See [docs/memory-and-mcp.md](docs/memory-and-mcp.md).
