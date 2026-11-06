# ai-persona

<p align="center"><img src="docs/images/ai-persona-hero.png" alt="ai-persona adapts coding agents across init, flow, debug, explore, and careful states" width="100%"></p>

<p align="center">
  <a href="https://opencode.ai"><img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-adapter-5577dd"></a>
  <a href="https://code.claude.com"><img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-adapter-d97757"></a>
  <a href="https://openai.com/codex"><img alt="Codex" src="https://img.shields.io/badge/Codex-adapter-111111"></a>
  <a href="https://skills.sh/aminammar1/ai-persona"><img alt="Agent Skills" src="https://img.shields.io/badge/Agent%20Skills-installable-8a63d2"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
</p>

Your coding agent, shaped around how you work. Five states adapt its style to your project and prompts while keeping your task intact. Hooks enforce standing orders. Memory stores short notes, never transcripts.

## How it works

<p align="center"><img src="docs/images/persona-flow.svg" alt="Prompts pass through a rule based detector and profile dials. Memory supplies short notes and guards check tool calls." width="760"></p>

The profile sets your baseline. State hints appear only on changes. A one word override works, and built in modes and permissions stay in control. See [agent coverage and hook gaps](docs/agent-hooks.md).

## Real project run

Same read only task in `/home/amine/code-source/bank-api-test`:

> Choose one existing API endpoint. Trace the request through the code, explain one edge case, and do not edit files.

| Agent | Observed result |
| --- | --- |
| OpenCode | Called `get_persona`, selected `explore`, traced `GET /account/{id}` through JWT checks and PostgreSQL, and left source files unchanged. |
| Codex | Classified the prompt as `explore` and traced the endpoint. Its project MCP did not appear in the session. A temporary server test reached the tool, but the session's no approval policy refused the call. |
| Claude Code | The skills and adapter setup completed. Its prompt hook returned an `explore` hint, but the requested `ccfree 3` run could not start because its configured model returned a 404. |

Guard check: OpenCode blocked `git push --dry-run /dev/null HEAD` before execution under a temporary `don't push` rule. The test rule was removed afterward.

This records a real smoke run, not a before and after benchmark. The Codex project must be trusted and its hooks reviewed with `/hooks`. Claude needs an available model in the local `ccfree 3` setup.

## Install

```bash
npx skills add aminammar1/ai-persona
```

Select all four skills, open your project in the agent, then run `persona-init`. It scans the project, creates `profile.md`, shows the setup plan, and asks before installing hooks and MCP.

| Skill | Use it to |
| --- | --- |
| `persona-init` | Create a profile and configure the current agent |
| `persona-mode` | Show or switch the current state |
| `persona-rules` | Add a standing order in plain language |
| `persona-learn` | Approve or reject a suggested update |

## Contribute

PRs are welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
