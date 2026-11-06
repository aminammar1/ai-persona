# ai-persona

### Your coding agent, shaped around how you work.

[![OpenCode](https://img.shields.io/badge/OpenCode-adapter-5577dd)](docs/agent-hooks.md#opencode-v225)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-adapter-d97757)](docs/agent-hooks.md#claude-code)
[![Codex](https://img.shields.io/badge/Codex-adapter-111111)](docs/agent-hooks.md#codex)
[![Skills](https://skills.sh/b/aminammar1/ai-persona)](https://skills.sh/aminammar1/ai-persona)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

ai-persona adapts how your coding agent works to your project and your prompts. The states are init, flow, debug, explore, and careful. They adjust verbosity, autonomy, caution, and exploration while your task stays yours. Hooks enforce standing orders, and project memory stores short notes instead of transcripts.

## Demo

*Illustrative flow.* Same task and project in both cases.

> Fix the parser error in `src/parser.ts`, run the focused check, and push.

Standing order: **don't push**.

| Without ai-persona | With ai-persona |
| --- | --- |
| The agent asks whether to run the requested check, asks again about pushing, then runs `git push`. | The agent fixes and checks without asking again. The guard blocks `git push` before it runs. |

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

Choose your coding agent and install the skills in this project. Then open the project with that agent and run `persona-init`. It prepares your profile, shows the setup plan, and asks before installing the runtime, hooks, and MCP server.

## Contributing

PRs are welcome for a project stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
