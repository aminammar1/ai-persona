---
name: persona-learn
description: Review suggested ai-persona profile or rule updates.
---

Use `list_learning_suggestions` to show at most three pending suggestions with their evidence. Ask a separate yes/no for each and have the developer reply `yes <id>` or `no <id>`. Call `review_learning_suggestion` only after that exact reply; the OpenCode prompt hook records it and the tool requires it. Never infer approval or auto-apply. Mention `list_changes` and offer `undo_change` for applied entries. Rejecting or skipping makes no change.
