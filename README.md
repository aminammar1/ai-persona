`npx skills add aminammar1/ai-persona`

# ai-persona

[![OpenCode adapter](https://img.shields.io/badge/OpenCode-adapter-5577dd)](docs/agent-hooks.md#opencode-v225)
[![Claude Code adapter](https://img.shields.io/badge/Claude%20Code-adapter-d97757)](docs/agent-hooks.md#claude-code)
[![Codex adapter](https://img.shields.io/badge/Codex-adapter-111111)](docs/agent-hooks.md#codex)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Personalize **how** your coding agent works—not what you asked it to do. Project profiles and five prompt-driven states tune verbosity, autonomy, caution, and exploration. Hooks enforce standing orders; SQLite keeps short, project-local notes without transcripts. OpenCode is the primary adapter, with Claude Code and Codex adapters.

## Demo

*Illustrative example, not a benchmark.* Standing order: **don't push**. Same task in both cases: “Fix the parser error in `src/parser.ts`, run the focused check, and push.”

**Without ai-persona**

- Agent: “Should I run the check?”
- Developer *(interrupts)*: “Yes, I already asked. Stop asking and fix the parser.”
- Agent: “Do you want me to push now?”
- Developer *(interrupts)*: “I said push, but my standing order says don't.”
- `git push` runs; the standing order was only text.

**With ai-persona**

- Agent: “I’ll focus on the parser, fix it, and run the focused check.”
- Tool guard: “Blocked by standing order: don't push.”
- Agent: “The fix and check are done. The push was blocked.”

Here, ai-persona avoids the two extra prompts and developer interruptions, and blocks the push before it runs. See [verified hook coverage and gaps](docs/agent-hooks.md).

## Get started

Run `persona-init` to scan the project, draft `profile.md`, and ask before setting up supported hooks or MCP. Codex hooks require the feature enabled and user trust review. See the [profile template](templates/profile.md), [memory and MCP](docs/memory-and-mcp.md), and the four skills: `persona-init`, `persona-mode`, `persona-rules`, and `persona-learn`.

## Contributing

PRs welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
