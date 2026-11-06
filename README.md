# ai-persona

### Your coding agent, shaped around how you work.

[![OpenCode](https://img.shields.io/badge/OpenCode-adapter-5577dd)](docs/agent-hooks.md#opencode-v225)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-adapter-d97757)](docs/agent-hooks.md#claude-code)
[![Codex](https://img.shields.io/badge/Codex-adapter-111111)](docs/agent-hooks.md#codex)
[![Skills](https://skills.sh/b/aminammar1/ai-persona)](https://skills.sh/aminammar1/ai-persona)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

ai-persona adapts how your coding agent works to your project and your prompts. The states are init, flow, debug, explore, and careful. They adjust verbosity, autonomy, caution, and exploration while your task stays yours. Hooks enforce standing orders, and project memory stores short notes instead of transcripts.

## Demo

*Illustrative example, not a benchmark.* Same task in both cases: “Fix the parser error in `src/parser.ts`, run the focused check, and push.” The project has a standing order: **don't push**.

**Without ai-persona**

Agent: “Should I run the check?”

Developer: “Yes, I already asked. Stop asking and fix the parser.”

Agent: “Do you want me to push now?”

Developer: “I said push, but my standing order says don't.”

`git push` runs because the order was only text.

**With ai-persona**

Agent: “I’ll focus on the parser, fix it, and run the focused check.”

Tool guard: “Blocked by standing order: don't push.”

The fix and check are done. The push was blocked before it ran.

Two fewer questions, two fewer interruptions, and the push is blocked.

## How it works

<p align="center"><img src="docs/images/persona-flow.svg" alt="A prompt passes through a rule based detector and profile dials. Project memory adds short notes. A guard checks supported tool calls before they run." width="760"></p>

The profile sets your baseline. Each state makes a small adjustment. A one word override works at any time, and the adapter respects the agent's built in modes. A hint appears only when the state changes. Hook gaps and limits are listed in the [agent coverage notes](docs/agent-hooks.md).

## Skills

`persona-init` creates a project profile and sets up the supported adapter with your permission.

`persona-mode` shows or changes the current state.

`persona-rules` adds a standing order and confirms how it was understood.

`persona-learn` reviews suggested profile or rule changes. Nothing is applied without your approval.

## Installation

```bash
npx skills add aminammar1/ai-persona
```

Then open your project with your coding agent and ask it to run `persona-init`.

## Contributing

PRs are welcome for a project stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
