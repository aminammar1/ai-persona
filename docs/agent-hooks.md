# Verified agent hooks

These lists come from the official docs read on 2026-11-06. Hook availability and behavior can change; check the linked docs again before implementing an adapter. A listed event is not a promise that every adapter can enforce every rule through it.

## OpenCode v2.2.5

The installed OpenCode version is `2.2.5`. Its official v2 plugin API exposes these hooks:

- Tool: `execute.before`, `execute.after`.
- Shell: `create.before`.
- Permission: `evaluate`.
- Session: `prompt`, `context`, `compaction`, `generate`, `title`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive`, `retry`, `experimental.idle`.
- AI SDK: `sdk`, `language`.

The standing-order adapter uses `ctx.tool.hook("execute.before", ...)`, which can inspect the effective tool name and input. It throws OpenCode's `Tool.Error` with the guard's one-line reason to reject the call before execution. `ctx.mcp.list()` identifies configured MCP server names for required-MCP guards. The project plugin uses `ctx.location.project.canonical` to select the current project's database.

Sources: [Plugin overview](https://opencode.ai/v2/docs/build/plugins/), [Server plugin API](https://opencode.ai/v2/docs/build/plugins/server), [MCP servers and tool names](https://opencode.ai/v2/docs/mcp-servers).

## Claude Code

The current hooks reference lists: `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, and `SessionEnd`.

`UserPromptSubmit` runs before Claude processes the prompt. `PreToolUse` can block a tool call, including built-in and MCP tools. The hooks reference documents marketplace plugins with `.claude-plugin/plugin.json`; the repository marketplace file is `.claude-plugin/marketplace.json`.

Sources: [Hooks reference](https://code.claude.com/docs/en/hooks), [Create a plugin](https://code.claude.com/docs/en/plugins/create), [Create a marketplace](https://code.claude.com/docs/en/plugins/create-marketplace).

## Codex

The current hooks reference lists: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`, `PreModelRequest`, and `PostModelRequest`.

`UserPromptSubmit` receives the prompt text. `PreToolUse` covers Bash, `apply_patch`, MCP calls, and most local function tools. Hosted tools such as web search are outside that path, and some specialized paths can opt out. A hook error or timeout does not necessarily block a tool call. Non-managed hooks require review and trust. Current Codex plugin docs support `.codex-plugin/plugin.json` as a compatibility manifest, with hook configuration documented separately; this scaffold does not register hooks.

Sources: [Hooks](https://learn.chatgpt.com/docs/hooks), [Package your plugin](https://developers.openai.com/plugins/build/plugins).
