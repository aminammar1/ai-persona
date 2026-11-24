# ai-persona

<p align="center"><img src="docs/images/ai-persona-hero.png" alt="ai-persona adapts coding agents across init, flow, debug, explore, and careful states" width="100%"></p>

<p align="center">
  [![M8ven Score](https://m8ven.ai/badge/mcp/aminammar1-ai-persona-1l51uy?v=8a05b6630645cc2b9335e8ce29dec2ec)](https://m8ven.ai/mcp/aminammar1-ai-persona-1l51uy?s=readme)
  <a href="https://opencode.ai"><img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-adapter-5577dd"></a>
  <a href="https://code.claude.com"><img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-adapter-d97757"></a>
  <a href="https://openai.com/codex"><img alt="Codex" src="https://img.shields.io/badge/Codex-adapter-111111"></a>
  <a href="https://github.com/can1357/oh-my-pi"><img alt="omp" src="https://img.shields.io/badge/omp-adapter-2f6f4f"></a>
  <a href="https://skills.sh/aminammar1/ai-persona"><img alt="Agent Skills" src="https://img.shields.io/badge/Agent%20Skills-installable-8a63d2"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
</p>

Your coding agent, shaped around how you work. Five states adapt its style to your project and prompts while keeping your task intact. Hooks check tool calls. Memory stores short notes, never transcripts.

## How it works

<p align="center"><img src="docs/images/persona-flow.svg" alt="Prompts pass through a rule based detector and profile dials. Memory supplies short notes and guards check tool calls." width="760"></p>

The profile sets your baseline. State hints appear only on changes. A one word override works, and built in modes and permissions stay in control. See [agent coverage and hook gaps](docs/agent-hooks.md).

## Demo

Real output from a live OpenCode run in a Go test project, captured with `opencode run`.

**One word changes the state.** A bare `careful` prompt rewrites the stored state:

```json
{
  "lastState": "careful",
  "settingsKey": "{\"verbosity\":\"balanced\",\"autonomy\":\"ask\",\"caution\":\"high\",\"exploration\":\"balanced\"}"
}
```

**Hints ride along invisibly.** The prompt stored in the OpenCode session database keeps your exact text, no persona line appended. The agent still quotes the system note verbatim:

```
Persona flow: verbosity balanced, autonomy act, caution balanced, exploration balanced. act on the task and keep updates brief. Keep the developer's task unchanged; respect active agent modes, tools, and permissions.
```

**Standing orders block tool calls before they run.** After confirming a `don't push` guard, `git push origin main` fails before executing:

```
Error: Blocked by standing order: don't push.
```

**Habits surface as short nudges** at the end of file tool results:

```
Created file successfully: nudge-test.txt
Profile habit (from profile.md): After changing code, run make test before claiming success.
```

And `get_persona` stays compact, 137 characters in this run:

```
Baseline dials: verbosity balanced, autonomy act, caution balanced, exploration balanced. Where we left off: No open problem was recorded.
```

## Install

```bash
npx skills add aminammar1/ai-persona
```

Install all four skills, open your project in the agent, then run `persona-init`. It scans the project, creates `profile.md`, shows the setup plan, and asks before installing hooks and MCP.

## Contribute

PRs are welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
