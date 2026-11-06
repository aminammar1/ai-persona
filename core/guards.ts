import { resolve, sep } from "node:path";
import {
  getActiveGuards,
  saveGuardProposal,
  confirmGuardProposal,
  type ActiveGuard,
  type GuardDefinition,
} from "./memory.ts";

export interface ToolCallForGuard {
  toolName: string;
  /** Shell command text, when the adapter is checking a shell tool. */
  command?: string;
  /** Paths the adapter has identified as targets of this tool call. */
  paths?: string[];
  /** MCP server identity for MCP calls. */
  mcpServer?: string;
}

export interface GuardDecision {
  blocked: boolean;
  reason: string | null;
  guardId: number | null;
}

export interface ParsedGuard {
  rule: string;
  definition: GuardDefinition;
}

function cleanOneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeProtectedPath(value: string): string {
  const path = value.trim().replace(/^['"`]|['"`]$/g, "").replace(/\\/g, "/").replace(/\/+$/, "");
  return path || "";
}

/** Parse the deliberately small, explicit standing-order vocabulary. */
export function parseStandingOrder(input: string): ParsedGuard | null {
  const text = cleanOneLine(input).replace(/^please\s+/i, "");
  const negative = "(?:don['’]t|do not|never)";

  if (new RegExp(`^${negative}\\s+(?:git\\s+)?commit\\b`, "i").test(text)) {
    return { rule: "Don't commit.", definition: { kind: "no_commit" } };
  }
  if (new RegExp(`^${negative}\\s+(?:git\\s+)?push\\b`, "i").test(text)) {
    return { rule: "Don't push.", definition: { kind: "no_push" } };
  }

  const pathMatch = text.match(new RegExp(`^${negative}\\s+(?:touch|edit|modify|change)\\s+(.+)$`, "i"));
  if (pathMatch) {
    const paths = pathMatch[1]
      .replace(/^(?:(?:this|these)\s+)?paths?\s*[:=]?\s*/i, "")
      .split(/[,;]+/)
      .map(normalizeProtectedPath)
      .filter(Boolean);
    const totalPathChars = paths.reduce((total, path) => total + path.length, 0);
    if (paths.length > 0 && paths.length <= 10 && totalPathChars <= 220 && paths.every((path) => path.length <= 120)) {
      return {
        rule: `Don't touch ${paths.join(", ")}.`,
        definition: { kind: "protected_paths", paths: [...new Set(paths)] },
      };
    }
  }

  const mcpMatch = text.match(/^use\s+(?:this\s+)?mcp(?:\s+server)?\s*[:=]?\s+(.+)$/i)
    ?? text.match(/^use\s+(?!this\s+mcp\b)(.+?)\s+mcp(?:\s+server)?$/i);
  if (mcpMatch) {
    const server = cleanOneLine(mcpMatch[1].replace(/^['"`]|['"`]$/g, ""));
    if (server && server.length <= 100) {
      return { rule: `Use MCP ${server}.`, definition: { kind: "required_mcp", server } };
    }
  }
  return null;
}

export function proposeGuard(projectRoot: string, rule: string): { proposalId: number; parsed: ParsedGuard } | null {
  const parsed = parseStandingOrder(rule);
  if (!parsed) return null;
  return { proposalId: saveGuardProposal(projectRoot, rule, parsed.definition), parsed };
}

export function confirmGuard(projectRoot: string, proposalId: number, accepted: boolean): boolean {
  return confirmGuardProposal(projectRoot, proposalId, accepted);
}

function isCommitCall(call: ToolCallForGuard): boolean {
  const name = call.toolName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_");
  const namedCommit = name === "commit" || name === "git_commit" || name === "git_commit_changes" || /(?:^|_)create_commit$/.test(name);
  const commandCommit = /\b(?:sudo\s+)?git\b(?:\s+(?:-[a-z]+(?:\s+\S+)?|--[a-z][\w-]*(?:=\S+)?))*\s+commit\b/i.test(call.command ?? "");
  return namedCommit || commandCommit;
}

function isPushCall(call: ToolCallForGuard): boolean {
  const name = call.toolName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_");
  const remoteWrites = new Set([
    "github_create_commit",
    "github_create_file",
    "github_update_file",
    "github_delete_file",
    "github_update_ref",
    "github_create_branch",
    "github_create_pull_request",
    "github_merge_pull_request",
  ]);
  const mcpRemoteWrite = Boolean(call.mcpServer && (
    /(?:^|_)push$/.test(name) || /(?:^|_)(?:create|update|delete)_(?:file|ref|branch|pull_request)$/.test(name) || /(?:^|_)merge_pull_request$/.test(name)
  ));
  const namedPush = name === "push" || name === "git_push" || remoteWrites.has(name) || mcpRemoteWrite;
  const commandPush = /\b(?:sudo\s+)?git\b(?:\s+(?:-[a-z]+(?:\s+\S+)?|--[a-z][\w-]*(?:=\S+)?))*\s+push\b/i.test(call.command ?? "");
  return namedPush || commandPush;
}

function isPathWithin(projectRoot: string, candidate: string, protectedPath: string): boolean {
  const root = resolve(projectRoot);
  const candidatePath = resolve(root, candidate);
  const deniedPath = resolve(root, protectedPath);
  return candidatePath === deniedPath || candidatePath.startsWith(`${deniedPath}${sep}`);
}

function commandMentionsPath(command: string, projectRoot: string, protectedPath: string): boolean {
  const forms = [protectedPath.replace(/\\/g, "/"), resolve(projectRoot, protectedPath).replace(/\\/g, "/")];
  return forms.some((path) => {
    if (!path || path === "/") return false;
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[\\s\"'=])${escaped}(?=$|[\\s\"'/:])`, "i").test(command);
  });
}

function commandContains(command: string, prohibited: string): boolean {
  const escaped = prohibited.trim().replace(/\s+/g, " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(^|[^\\w./+-])${escaped}(?=$|[^\\w./+-])`, "i").test(command.replace(/\s+/g, " "));
}

function matchingProtectedPath(
  projectRoot: string,
  call: ToolCallForGuard,
  protectedPaths: string[],
): string | null {
  return protectedPaths.find((protectedPath) =>
    (call.paths ?? []).some((candidate) => isPathWithin(projectRoot, candidate, protectedPath)) ||
    commandMentionsPath(call.command ?? "", projectRoot, protectedPath)) ?? null;
}

function normalizeMcpIdentity(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function matches(guard: ActiveGuard, projectRoot: string, call: ToolCallForGuard): boolean {
  switch (guard.definition.kind) {
    case "no_commit": return isCommitCall(call);
    case "no_push": return isPushCall(call);
    case "deny_command": return Boolean(call.command && commandContains(call.command, guard.definition.command));
    case "protected_paths": return matchingProtectedPath(projectRoot, call, guard.definition.paths) !== null;
    case "required_mcp":
      return Boolean(call.mcpServer && normalizeMcpIdentity(call.mcpServer) !== normalizeMcpIdentity(guard.definition.server));
  }
}

/** Check an imminent tool call. This is independent of persona state. */
export function evaluateGuards(
  projectRoot: string,
  call: ToolCallForGuard,
  guards: ActiveGuard[],
): GuardDecision {
  for (const guard of guards) {
    if (!matches(guard, projectRoot, call)) continue;
    const matchedPath = guard.definition.kind === "protected_paths"
      ? matchingProtectedPath(projectRoot, call, guard.definition.paths)
      : null;
    const reason = guard.definition.kind === "no_commit"
      ? "Blocked by standing order: don't commit."
      : guard.definition.kind === "no_push"
        ? "Blocked by standing order: don't push."
        : guard.definition.kind === "deny_command"
          ? `Blocked by standing order: never run ${cleanOneLine(guard.definition.command)}.`
        : guard.definition.kind === "protected_paths"
          ? `Blocked by standing order: don't touch ${cleanOneLine(matchedPath ?? guard.definition.paths[0])}.`
          : `Blocked by standing order: use MCP ${cleanOneLine(guard.definition.server)} for MCP calls.`;
    return { blocked: true, reason, guardId: guard.id };
  }
  return { blocked: false, reason: null, guardId: null };
}

/** Adapter entry point: read this project's rules and check before tool execution. */
export function checkGuard(projectRoot: string, call: ToolCallForGuard): GuardDecision {
  return evaluateGuards(projectRoot, call, getActiveGuards(projectRoot));
}
