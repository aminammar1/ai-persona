# Verified agent hooks

These lists come from the official docs read on 2026-11-06. Hook availability and behavior can change; check the linked docs again before implementing an adapter. A listed event is not a promise that every adapter can enforce every rule through it.

After the developer approves setup, `persona-init` fetches the runtime into `.ai-persona/runtime`, installs its dependencies, and adds the current agent's hook and MCP configuration to the project. It does not change built in modes, tools, or permissions.

## OpenCode v2.2.5

`opencode --version` reported `opencode v2.2.5`. The official v2 plugin API exposes these hooks:

- Tool: `execute.before`, `execute.after`.
- Shell: `create.before`.
- Permission: `evaluate`.
- Session: `prompt`, `context`, `compaction`, `generate`, `title`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive`, `retry`, `experimental.idle`.
- AI SDK: `sdk`, `language`.

The per-prompt hook is `ctx.session.hook("prompt", ...)`. It sees an incoming user prompt once at admission, before attachment and skill resolution. It does not see synthetic messages, shell messages, compaction controls, or move controls. The adapter runs the detector there and appends a hint only when the state changes. Repeated prompts are recognized with short project state fingerprints; prompt text is not retained. A user interruption sets the next prompt to debug.

`ctx.event.subscribe()` exposes lifecycle events including `session.created`, `session.execution.interrupted`, `session.idle`, `permission.asked`, `permission.replied`, and `session.compaction.ended`. The compaction ended event includes the generated summary text, so the adapter requests labeled decision, correction, and open problem sections and stores only those bullets. `session.compacted` is not an event name in the v2.2.5 API. `file.edited` is also absent from the v2 API; `filesystem.changed` is a different event, so the adapter uses successful file tool results for its habit nudge.

The adapter uses `ctx.tool.hook("execute.before", ...)` for guards and `execute.after` to add the profile's habit nudge to successful file-edit tool results. It records user interruptions and paired permission replies in project SQLite. Reviewed permission preferences are stored as project notes only; the adapter does not change OpenCode's built-in permission decisions. The TUI plugin listens to `session.idle`, showing an in-app toast and a system notification when OpenCode is blurred.

Sources: [Plugin overview](https://opencode.ai/v2/docs/build/plugins/), [Server plugin API](https://opencode.ai/v2/docs/build/plugins/server), [TUI plugin API](https://opencode.ai/v2/docs/build/plugins/cli/), [MCP servers and tool names](https://opencode.ai/v2/docs/mcp-servers).

## Claude Code

The current reference exposes: `SessionStart`, `Setup`, `InstructionsLoaded`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `SessionEnd`, `Elicitation`, and `ElicitationResult`.

The installer merges `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`, and `PostCompact` from `hooks/hooks.json` into the project's `.claude/settings.json`. The shared TypeScript handler initializes the state, classifies each submitted prompt, checks supported tool calls before execution, adds the profile nudge after successful file tools, and emits a completion message at `Stop` with system message output. The adapter does not register `PermissionRequest` or `PermissionDenied`: the API exposes permission asks and denials, but no hook reports the user's approval reply, so the events cannot be paired into a complete record. `PreCompact` asks for labeled durable facts; `PostCompact` parses those sections and stores only their bullets.

Claude's current `PreToolUse` hook covers built-in and MCP tool calls, except `EndConversation`; prompt `@` file mentions can also bypass tool hooks. The adapter only recognizes common path argument names, so a custom tool with an unrecognized path field is outside protected-path enforcement. `PostToolUse` fires after successful tool calls, and this adapter listens only for file tools; shell or external file writes do not trigger its habit nudge. Claude has no interruption event.

Sources: [Hooks reference](https://code.claude.com/docs/en/hooks), [Plugin components and hooks](https://code.claude.com/docs/en/plugins/components).

## Codex

The current reference exposes: `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `Stop`, `Interrupt`, `PermissionRequest`, `PreModelRequest`, and `PostModelRequest`.

The compatibility manifest explicitly points to `hooks/codex-hooks.json`. The installer merges `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `Interrupt` into the project's `.codex/hooks.json`, and adds the MCP server to `.codex/config.toml`. The `Interrupt` entry sets `"timeout": 3`, the maximum Codex allows, because interrupt hooks otherwise get a 1 second default. Codex's current feature key is `[features].hooks`; `codex_hooks` is a deprecated alias. Project `.codex` settings load only after the developer trusts that project; until then, project hooks and the project MCP entry do not load. Review the hook definitions with `/hooks` and trust them before relying on the adapter. `persona-init` warns during setup when the project is not marked trusted and when hooks are disabled; it does not change project trust, model settings, or built in permissions.

In an earlier local Codex CLI 0.167.0 smoke run, the project MCP entry did not respond during the session; the verified cause was that the project was not yet marked trusted, so Codex loaded no project `.codex` layer at all. An interim, temporary global MCP entry exposed `get_persona`, but Codex refused the call because the session approval policy was `never`; that temporary entry was removed. The adapter does not change project trust or Codex approval policy. Verify MCP access in a trusted interactive project session before relying on memory tools.

The adapter initializes state, classifies prompts, checks supported tool calls before execution, nudges after successful `apply_patch`/edit tools, records main-thread interruptions, and emits a completion message at `Stop`. Current Codex tool hooks cover Bash, `apply_patch`, MCP tools, and most local function tools, but not hosted tools such as web search; specialized paths can opt out. A tool using an unrecognized path argument is outside protected-path enforcement. Hook process failures and timeouts are not an enforcement guarantee, so callers must see an explicit denial response for a guard to block. `PermissionRequest` reports that approval is being requested, but no hook reports the user's approval reply, so the adapter does not register it. `PostCompact` reports only the trigger, not the compacted summary, so Codex cannot save structured compaction memory without reading its transcript. The adapter deliberately leaves that feature off.

Sources: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins).
