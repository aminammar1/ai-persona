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

`recordCompactionSummary(projectRoot, summary)` is an internal API for adapters to call at a verified compaction event. The OpenCode, Claude Code, and Codex adapters are not wired to it yet; each adapter must first be checked against its current official hook documentation.
