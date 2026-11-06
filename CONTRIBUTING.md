# Contributing

PRs are welcome for:

* A project stack profile template under `templates/`.
* A persona preset that adjusts how the agent works without changing the task.
* An adapter for an agent with documented hooks.

For adapter changes, link the agent's current official hook documentation and document unsupported hooks or tool paths. Keep enforcement in hooks or tools, preserve the agent's built in permissions and modes, and keep learning suggest only. No transcript storage, tests, or CI are part of this project.

Run `npm run typecheck` before opening a PR. Include a short usage example and note any setup or hook coverage limits.
