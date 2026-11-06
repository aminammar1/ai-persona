# Project memory and MCP tools

The local MCP server is started with `npm run mcp` from the project root. It speaks stdio; stdout is reserved for MCP messages. The server uses its launch directory as the project boundary and writes memory to `.ai-persona/memory.sqlite`.

## Stored data

- `memories` stores concise decisions, corrections, and open problems. Repeated identical notes increment an occurrence count.
- `suggestions` stores proposed profile or rule changes with `pending` status. Proposals never edit the profile or agent configuration.
- There is no transcript table. `recordCompactionSummary()` accepts only structured arrays of decisions, corrections, and open problems; it truncates each saved note to 240 characters. Each compaction replaces the open-problem snapshot, so resolved problems do not reappear as the next session's handoff note.

Each project's database is in that project's directory. `get_persona(task)` cannot select a different project; it returns the current project's baseline, a small task-relevant profile slice, and at most three short notes. Its response is capped at 800 characters. The newest open problem supplies the “where we left off” note. No prior-project memory is consulted.

## Tools

- `get_persona(task)`: return baseline dials, matching profile headings and an optional matching file under `profile/`, plus at most three notes.
- `record_correction(note)`: save one concise correction for the current project.
- `propose_update(change)`: save a pending suggestion; approval is still required before anyone applies it.
- `propose_guard(rule)` and `confirm_guard(proposalId, accepted)`: parse a supported standing order, show its meaning once, then activate it only after explicit confirmation.
- `list_learning_suggestions()`: return at most three pending, evidence-backed suggestions.
- `review_learning_suggestion(suggestionId, approved)`: explicitly apply one narrow change or reject it.
- `list_changes()` and `undo_change(changeId)`: inspect recent applied changes and undo one without deleting its log entry.

`recordCompactionSummary(projectRoot, summary)` is an internal API for adapters to call at a verified compaction event. The OpenCode, Claude Code, and Codex adapters are not wired to it yet; each adapter must first be checked against its current official hook documentation.

## Standing-order guards

Confirmed guards are stored in the same project-local SQLite file and are checked by `checkGuard(projectRoot, call)` before an adapter runs a tool. Supported forms are `don't commit`, `don't push`, `don't touch <path>[, <path>...]`, and `use this MCP <name>`. A required-MCP guard blocks calls to other MCP servers; it leaves non-MCP tools alone. The check does not depend on persona state. Matching calls receive one single-line reason. Adapters must normalize tool identity, MCP server identity, shell command text, and target paths before calling it.

The OpenCode v2 plugin at `.opencode/plugins/ai-persona/` checks confirmed rules in the `execute.before` tool hook and raises OpenCode's `Tool.Error` with a one-line reason before execution. It selects the database using the current session location. Guards run regardless of persona state. If the store or adapter check fails, the hook blocks the call rather than letting an unchecked call run. This adapter targets OpenCode 2.2.5; Claude Code and Codex pre-tool adapters are not wired yet.

OpenCode loads this local plugin automatically. Its v2 API does not expose `session.compacted`; `session.compaction.ended` exists, but this plugin does not use it as a substitute. Compaction memory saving therefore remains unwired.

## Learning from repeated signals

The SQLite store counts identical corrections, user-caused `session.execution.interrupted` events, and permission requests paired by request ID with their replies. Suggestions require at least two identical corrections or interruptions. Permission suggestions require at least two exact `once` approvals for the same action and single resource, with no rejection. `always` replies are recorded but never suggested again because OpenCode already has that native saved approval. Wildcards, multiple resources, project-root permissions, directories, paths outside the project, and unrecognized resource types are excluded.

Signal detection only creates pending suggestions. The OpenCode prompt hook records only an exact developer reply of `yes <suggestionId>` or `no <suggestionId>`; the review tool refuses to change anything without that matching one-use confirmation. Supported applied changes are learned habits, a low-verbosity debug adjustment, a narrow “never run” command guard, and a recorded permission preference. That preference is a project note only; the plugin never changes the agent's built-in permission settings. Every applied change stores its action and target in `applied_changes`; `undo_change` removes that exact learned effect and retains the log record. `list_changes(beforeId)` pages through the full log three entries at a time. `get_persona` includes at most one approved habit within its existing three-note budget.
