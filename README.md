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

## Demo

Try this prompt in any codebase:

> Trace one existing request from its entry point through the relevant code. Explain what happens and include one edge case. Do not edit files.

The agent uses the project's profile and relevant notes to shape the explanation. A prompt asking for a walkthrough moves the persona toward explore, while the task itself stays unchanged. Standing orders continue to guard matching tool calls in every state.

## Install

```bash
npx skills add aminammar1/ai-persona
```

Install all four skills, open your project in the agent, then run `persona-init`. It scans the project, creates `profile.md`, shows the setup plan, and asks before installing hooks and MCP.

## Contribute

PRs are welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
