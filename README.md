# ai-persona

<p align="center"><img src="docs/images/ai-persona-hero.png" alt="ai-persona adapts coding agents across init, flow, debug, explore, and careful states" width="100%"></p>

<p align="center">
  <a href="https://opencode.ai"><img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-adapter-5577dd"></a>
  <a href="https://code.claude.com"><img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-adapter-d97757"></a>
  <a href="https://openai.com/codex"><img alt="Codex" src="https://img.shields.io/badge/Codex-adapter-111111"></a>
  <a href="https://skills.sh/aminammar1/ai-persona"><img alt="Agent Skills" src="https://img.shields.io/badge/Agent%20Skills-installable-8a63d2"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
</p>

Your coding agent, shaped around how you work. Five states adapt its style to your project and prompts while keeping your task intact. Hooks check tool calls. Memory stores short notes, never transcripts.

## How it works

<p align="center"><img src="docs/images/persona-flow.svg" alt="Prompts pass through a rule based detector and profile dials. Memory supplies short notes and guards check tool calls." width="760"></p>

The profile sets your baseline. State hints appear only on changes. A one word override works, and built in modes and permissions stay in control. See [agent coverage and hook gaps](docs/agent-hooks.md).

## Real project demo

Same task, run with each supported agent:

> Choose one existing API endpoint in this project. Trace how a request moves through the code and explain what happens, including one edge case. Do not edit any files. Use ai-persona context if it is available, and keep the explanation focused.

| Run | Observed result |
| --- | --- |
| OpenCode without ai-persona | Traced `GET /account/{id}` through JWT middleware and PostgreSQL. Explained that a malformed ID returns `403`. |
| OpenCode with ai-persona | Loaded project context, switched to `explore`, and traced the same route. Also found an unchecked JWT claim assertion and the custom expiry claim. No files changed. |
| Codex | Traced the same endpoint and edge case. The persona MCP was not available in the session, so this run did not verify persona context. |
| Claude Code | The prompt hook selected `explore`. A complete agent response could not be verified because the configured model returned an error. |

The OpenCode comparison shows the added project context. The OpenCode tool guard also blocked a push attempt before it ran.

## Install

```bash
npx skills add aminammar1/ai-persona
```

Install all four skills, open your project in the agent, then run `persona-init`. It scans the project, creates `profile.md`, shows the setup plan, and asks before installing hooks and MCP.

## Contribute

PRs are welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
