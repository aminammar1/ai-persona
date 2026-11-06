import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { getPersonaContext } from "../core/persona-context.ts";
import { proposeUpdate, recordCorrection } from "../core/memory.ts";
import { confirmGuard, proposeGuard } from "../core/guards.ts";

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
      return { content: [{ type: "text", text: "Correction saved for this project." }] };
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

  return server;
}

// stdio is the MCP protocol channel; keep diagnostics off stdout.
void serveStdio(createServer);
