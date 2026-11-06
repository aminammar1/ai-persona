import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateGuards } from "../core/guards.ts";
import { getActiveGuards, recordCompactionText } from "../core/memory.ts";
import { recordInterruption, recordLearningConfirmation } from "../core/learning.ts";
import { loadProfile } from "../core/profile.ts";
import { processPrompt } from "../core/transition.ts";
import { markPromptInterrupted, resetPromptSignals, writeLastState } from "../core/state-store.ts";
import type { ToolCallForGuard } from "../core/guards.ts";

interface HookInput extends Record<string, unknown> {
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  source?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: unknown;
  permissionDecision?: string;
  event?: string;
  compact_summary?: string;
}

const agent = process.env.AI_PERSONA_AGENT === "codex" ? "codex" : "claude";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function collectPaths(input: unknown): string[] {
  const paths: string[] = [];
  const pathKeys = new Set(["filepath", "file_path", "path", "paths", "file", "files", "target", "destination", "filename"]);
  const visit = (value: unknown, key = ""): void => {
    if (typeof value === "string") {
      if (pathKeys.has(key.toLocaleLowerCase())) paths.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    }
  };
  visit(input);
  const patch = object(input).command ?? object(input).patchText ?? object(input).patch;
  if (typeof patch === "string") {
    const marker = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
    for (const match of patch.matchAll(marker)) paths.push(match[1].trim());
  }
  return [...new Set(paths)];
}

function toolCall(input: HookInput): ToolCallForGuard {
  const toolName = typeof input.tool_name === "string" ? input.tool_name : "unknown";
  const args = object(input.tool_input);
  const isShell = /^(?:bash|shell|exec_command|terminal)$/i.test(toolName);
  const command = isShell ? [args.command, args.cmd].find((value) => typeof value === "string") : undefined;
  const explicitServer = object(input.mcp_server).name;
  const toolParts = toolName.split("__");
  const mcpServer = typeof explicitServer === "string"
    ? explicitServer
    : toolParts.length >= 3 && toolParts[0].toLocaleLowerCase() === "mcp"
      ? toolParts.slice(1, -1).join("__")
      : undefined;
  return {
    toolName,
    ...(typeof command === "string" ? { command } : {}),
    paths: collectPaths(input.tool_input),
    ...(typeof mcpServer === "string" ? { mcpServer } : {}),
  };
}

function habitNudge(projectRoot: string): string | null {
  const sections = loadProfile(projectRoot, { sections: ["Habit nudge", "Habits"] }).sections;
  const dedicated = sections["Habit nudge"]?.split(/\r?\n/).map((line) => line.replace(/^\s*[-*]\s*/, "").trim()).find(Boolean);
  const fromHabits = sections.Habits?.split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .find((line) => /\b(run|test|build|lint|verify|check)\b/i.test(line));
  const value = dedicated || fromHabits;
  return value?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 140).trim() || null;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as HookInput;
  const projectRoot = resolve(typeof input.cwd === "string" ? input.cwd : process.cwd());
  const event = input.hook_event_name ?? "";

  if (event === "SessionStart") {
    if (input.source === "startup" || input.source === "clear") {
      resetPromptSignals(projectRoot);
      writeLastState(projectRoot, "init");
    }
    return;
  }

  if (event === "UserPromptSubmit") {
    if (typeof input.prompt !== "string") return;
    recordLearningConfirmation(projectRoot, input.prompt);
    const nativeMode = input.permission_mode === "plan" ? "Plan" : undefined;
    const transition = processPrompt(projectRoot, input.prompt, { nativeMode });
    if (transition.hint) {
      output({ hookSpecificOutput: { hookEventName: event, additionalContext: transition.hint } });
    }
    return;
  }

  if (event === "PreToolUse") {
    try {
      const decision = evaluateGuards(projectRoot, toolCall(input), getActiveGuards(projectRoot));
      if (!decision.blocked) return;
      const reason = oneLine(decision.reason ?? "Blocked by an ai-persona standing order.");
      output(agent === "codex"
        ? { hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason } }
        : { hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason } });
    } catch {
      const reason = "Blocked: ai-persona standing-order checks failed; repair the project store and retry.";
      output({ hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason } });
    }
    return;
  }

  if (event === "PostToolUse") {
    const tool = typeof input.tool_name === "string" ? input.tool_name.toLocaleLowerCase() : "";
    if (!/(?:^|_)(?:edit|write|apply_patch|notebookedit)$/.test(tool)) return;
    const nudge = habitNudge(projectRoot);
    if (nudge) output({ hookSpecificOutput: { hookEventName: event, additionalContext: `Profile habit: ${nudge}` } });
    return;
  }

  if (event === "PermissionRequest" || event === "PermissionDenied") {
    const toolName = typeof input.tool_name === "string" ? input.tool_name : "unknown";
    process.stderr.write(`[ai-persona] ${agent} ${event} for ${toolName}\n`);
    return;
  }

  if (event === "Interrupt") {
    recordInterruption(projectRoot, "user", typeof input.turn_id === "string" ? input.turn_id : undefined);
    markPromptInterrupted(projectRoot);
    return;
  }

  if (event === "PreCompact" && agent === "claude") {
    process.stdout.write("For the ai-persona project handoff, include these exact headings and concise bullets: Decisions, Corrections, Open problems. Use an empty Open problems section when none remain. Include only durable project facts. Never include a transcript or unrelated detail.\n");
    return;
  }

  if (event === "PostCompact" && agent === "claude") {
    if (typeof input.compact_summary === "string") recordCompactionText(projectRoot, input.compact_summary);
    return;
  }

  if (event === "Stop") {
    output({ systemMessage: "ai-persona: the agent has finished this turn." });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[ai-persona] hook error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
