import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { getPersonaContext } from "../core/persona-context.ts";
import { proposeUpdate, recordCorrection } from "../core/memory.ts";
import { confirmGuard, proposeGuard } from "../core/guards.ts";
import {
  considerCorrection,
  listAppliedChanges,
  listLearningSuggestions,
  reviewLearningSuggestion,
  undoAppliedChange,
} from "../core/learning.ts";

const projectRoot = process.cwd();

function createServer(): McpServer {
  const server = new McpServer({ name: "ai-persona", version: "0.1.0" });

  server.registerTool(
    "get_persona",
    {
      description: "Get this project's baseline profile and up to three short memory notes relevant to a task.",
      inputSchema: z.object({ task: z.string().trim().min(1).max(2000) }),
    },
    async ({ task }) => ({ content: [{ type: "text", text: getPersonaContext(projectRoot, task) }] }),
  );

  server.registerTool(
    "record_correction",
    {
      description: "Store one concise developer correction in this project's local memory. No transcript is stored.",
      inputSchema: z.object({ note: z.string().trim().min(1).max(1000) }),
    },
    async ({ note }) => {
      recordCorrection(projectRoot, note);
      const suggestionId = considerCorrection(projectRoot, note);
      return {
        content: [{ type: "text", text: suggestionId
          ? `Correction saved. Repeated pattern created suggestion ${suggestionId}; nothing was applied.`
          : "Correction saved. A single occurrence never creates or applies a suggestion." }],
      };
    },
  );

  server.registerTool(
    "propose_update",
    {
      description: "Save a suggested profile or rule change for developer review. This never applies the change.",
      inputSchema: z.object({ change: z.string().trim().min(1).max(1000) }),
    },
    async ({ change }) => {
      const id = proposeUpdate(projectRoot, change);
      return {
        content: [{ type: "text", text: `Suggestion ${id} saved as pending. Nothing was changed; ask the developer before applying it.` }],
      };
    },
  );

  server.registerTool(
    "propose_guard",
    {
      description: "Parse a plain-language standing order and save it pending explicit developer confirmation.",
      inputSchema: z.object({ rule: z.string().trim().min(1).max(500) }),
    },
    async ({ rule }) => {
      const proposal = proposeGuard(projectRoot, rule);
      if (!proposal) {
        return {
          content: [{ type: "text", text: "I couldn't parse that rule. Use a clear don't commit, don't push, don't touch <path>, or use this MCP <name> instruction." }],
          isError: true,
        };
      }
      return {
        content: [{
          type: "text",
          text: `Parsed as: ${proposal.parsed.rule} Confirm with the developer once before activating (proposal ${proposal.proposalId}).`,
        }],
      };
    },
  );

  server.registerTool(
    "confirm_guard",
    {
      description: "Activate or reject a previously shown standing-order proposal after the developer answers.",
      inputSchema: z.object({ proposalId: z.number().int().positive(), accepted: z.boolean() }),
    },
    async ({ proposalId, accepted }) => {
      const changed = confirmGuard(projectRoot, proposalId, accepted);
      return {
        content: [{
          type: "text",
          text: !changed
            ? "No pending standing-order proposal with that id was found."
            : accepted
              ? "Standing order activated for this project. It will apply in every persona state."
              : "Standing-order proposal rejected; no guard was activated.",
        }],
      };
    },
  );

  server.registerTool(
    "list_learning_suggestions",
    {
      description: "List up to three pending learning suggestions. Each requires a separate explicit yes or no.",
      inputSchema: z.object({}),
    },
    async () => {
      const suggestions = listLearningSuggestions(projectRoot, 3);
      return {
        content: [{ type: "text", text: suggestions.length
          ? suggestions.map((item) => `${item.id}. ${item.change} Reason: ${item.reason}`).join("\n")
          : "No pending learning suggestions." }],
      };
    },
  );

  server.registerTool(
    "review_learning_suggestion",
    {
      description: "Approve or reject one learning suggestion. Approval applies only that narrow change and records it for undo.",
      inputSchema: z.object({ suggestionId: z.number().int().positive(), approved: z.boolean() }),
    },
    async ({ suggestionId, approved }) => {
      const result = reviewLearningSuggestion(projectRoot, suggestionId, approved);
      return {
        content: [{ type: "text", text: !result.changed
          ? result.confirmationRequired
            ? `No matching developer confirmation was recorded. Ask for “yes ${suggestionId}” or “no ${suggestionId}” before reviewing it.`
            : "No pending learning suggestion with that id was found."
          : approved
            ? `Suggestion applied as change ${result.changeId}. It can be undone with undo_change.`
            : "Suggestion rejected; no change was made." }],
      };
    },
  );

  server.registerTool(
    "list_changes",
    {
      description: "Show up to three recent applied or undone learning changes.",
      inputSchema: z.object({ beforeId: z.number().int().positive().optional() }),
    },
    async ({ beforeId }) => {
      const changes = listAppliedChanges(projectRoot, 3, beforeId);
      return {
        content: [{ type: "text", text: changes.length
          ? changes.map((change) => `${change.id}. ${change.details}: ${change.undoneAt ? "undone" : "active"}`).join("\n")
          : "No learning changes have been applied." }],
      };
    },
  );

  server.registerTool(
    "undo_change",
    {
      description: "Undo one applied learning change by its change id.",
      inputSchema: z.object({ changeId: z.number().int().positive() }),
    },
    async ({ changeId }) => ({
      content: [{ type: "text", text: undoAppliedChange(projectRoot, changeId)
        ? `Change ${changeId} undone; its log entry was retained.`
        : "No active change with that id was found." }],
    }),
  );

  return server;
}

// stdio is the MCP protocol channel; keep diagnostics off stdout.
void serveStdio(createServer);
