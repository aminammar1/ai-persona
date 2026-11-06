# Project memory and MCP tools

The local MCP server speaks stdio; stdout is reserved for MCP messages. `persona-init` registers it for the selected agent and sets the current project root explicitly. It writes memory to `.ai-persona/memory.sqlite`.

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

`recordCompactionSummary(projectRoot, summary)` stores structured decisions, corrections, and the complete current open problem list. OpenCode reads the generated text from `session.compaction.ended`; Claude Code instructs compaction to emit labeled sections and reads `compact_summary` from `PostCompact`. Both store only bullets under those headings. Codex `PostCompact` exposes only the trigger, so Codex compaction saving remains unavailable without reading a transcript. Prompt repetition state stores only three SHA 256 fingerprints in the project's state file and resets at a new session; prompt text is not retained.

## Standing-order guards

Confirmed guards are stored in the same project-local SQLite file and are checked by `checkGuard(projectRoot, call)` before an adapter runs a tool. Supported forms are `don't commit`, `don't push`, `don't touch <path>[, <path>...]`, and `use this MCP <name>`. A required-MCP guard blocks calls to other MCP servers; it leaves non-MCP tools alone. The check does not depend on persona state. Matching calls receive one single-line reason. Adapters must normalize tool identity, MCP server identity, shell command text, and target paths before calling it.

The OpenCode v2 plugin at `.opencode/plugins/ai-persona/` checks confirmed rules in the `execute.before` tool hook and raises OpenCode's `Tool.Error` with a one-line reason before execution. It selects the database using the current session location. Guards run regardless of persona state. If the store or adapter check fails, the hook blocks the call rather than letting an unchecked call run. `persona-init` installs the runtime into `.ai-persona/runtime`, links this plugin into `.opencode/plugins/`, and registers the MCP server. Claude Code and Codex call `hooks/agent-hook.ts` from their project hook configuration. Their verified hook coverage and gaps are listed in [agent-hooks.md](agent-hooks.md).

OpenCode loads this local plugin automatically. Its v2 API does not expose `session.compacted`; it exposes `session.compaction.ended` with the generated summary text. The plugin adds a short structured handoff request to the real `compaction` session hook, then stores only labeled bullets from the completed summary.

## Learning from repeated signals

The SQLite store counts identical corrections, user-caused `session.execution.interrupted` events, and paired permission requests. Permission pairing exists only in the OpenCode adapter, whose `permission.asked` and `permission.replied` events carry both sides of a permission decision; the Claude Code and Codex hook APIs have a permission-ask hook but no approval-reply hook, so their adapters do not record permission events. Suggestions require at least two identical corrections or interruptions. Permission suggestions require at least two exact `once` approvals for the same action and single resource, with no rejection. `always` replies are recorded but never suggested again because OpenCode already has that native saved approval. Wildcards, multiple resources, project-root permissions, directories, paths outside the project, and unrecognized resource types are excluded.

Signal detection only creates pending suggestions. The OpenCode prompt hook records only an exact developer reply of `yes <suggestionId>` or `no <suggestionId>`; the review tool refuses to change anything without that matching one-use confirmation. Supported applied changes are learned habits, a low-verbosity debug adjustment, a narrow “never run” command guard, and a recorded permission preference. That preference is a project note only; the plugin never changes the agent's built-in permission settings. Every applied change stores its action and target in `applied_changes`; `undo_change` removes that exact learned effect and retains the log record. `list_changes(beforeId)` pages through the full log three entries at a time. `get_persona` includes at most one approved habit within its existing three-note budget.
