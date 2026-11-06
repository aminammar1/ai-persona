# Local agent testing

- Claude Code: run `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000 ccfree 3` to use the developer's local cloud-model setup.
- Codex: use the model already configured for this developer; do not change the model setting for tests.
- OpenCode: use the free `glm5.3` model.

These are local development choices, not ai-persona runtime defaults. Do not change an agent's built-in tools, modes, model settings, or permissions as part of the plugin.

# Git remote

- Keep `origin` set to `git@github.com:aminammar1/ai-persona.git`; use SSH for pushes and pulls, and do not switch this remote to HTTPS.
