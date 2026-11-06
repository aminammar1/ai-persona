<p align="center"><code>npx skills add aminammar1/ai-persona</code></p>

<h1 align="center">ai-persona</h1>

<p align="center">Your coding agent, shaped around how you work.</p>

<p align="center">
  <a href="docs/agent-hooks.md#opencode-v225"><img alt="OpenCode adapter" src="https://img.shields.io/badge/OpenCode-adapter-5577dd"></a>
  <a href="docs/agent-hooks.md#claude-code"><img alt="Claude Code adapter" src="https://img.shields.io/badge/Claude%20Code-adapter-d97757"></a>
  <a href="docs/agent-hooks.md#codex"><img alt="Codex adapter" src="https://img.shields.io/badge/Codex-adapter-111111"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
</p>

<p align="center"><img src="docs/images/persona-flow.svg" alt="A prompt flows through a rule based detector and profile dials to the agent. Project memory adds short notes. A guard checks every supported tool call before it runs." width="100%"></p>

Personalize how your agent works without changing your task. Five prompt driven states shift verbosity, autonomy, caution, and exploration around a project profile. Hooks enforce standing orders. SQLite keeps short project notes, never transcripts. Learning changes require your approval.

## Demo

*Illustrative example, not a benchmark.* Standing order: **don't push**. Same task in both cases: “Fix the parser error in `src/parser.ts`, run the focused check, and push.”

**Without ai-persona**

* Agent: “Should I run the check?”
* Developer *(interrupts)*: “Yes, I already asked. Stop asking and fix the parser.”
* Agent: “Do you want me to push now?”
* Developer *(interrupts)*: “I said push, but my standing order says don't.”
* `git push` runs; the standing order was only text.

**With ai-persona**

* Agent: “I’ll focus on the parser, fix it, and run the focused check.”
* Tool guard: “Blocked by standing order: don't push.”
* Agent: “The fix and check are done. The push was blocked.”

The example shows two fewer questions, two fewer interruptions, and a push blocked before it runs. Read the [hook coverage and limits](docs/agent-hooks.md), then run `persona-init` to set up your project.

## Contributing

PRs are welcome for a stack template, persona preset, or agent adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Mohamed Amine Ammar.
