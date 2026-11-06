#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const repository = "git@github.com:aminammar1/ai-persona.git";

function run(command, args, cwd, quiet = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: quiet ? "ignore" : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
}

function available(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" });
  return result.status === 0;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON. Fix it before installing ai-persona.`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.ai-persona-tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function mergeHookSettings(path, adapterHooks, runtime, agent) {
  const settings = readJson(path, {});
  settings.hooks ??= {};
  for (const [event, entries] of Object.entries(adapterHooks.hooks ?? {})) {
    const installed = entries.map((entry) => {
      const copy = structuredClone(entry);
      for (const hook of copy.hooks ?? []) {
        if (agent === "claude") {
          hook.command = hook.command.replace(
            'cd "${CLAUDE_PLUGIN_ROOT}"',
            `cd "${runtime}"`,
          );
        } else {
          hook.command = hook.command.replace(
            '"${PLUGIN_ROOT}"',
            `"${runtime}"`,
          );
        }
      }
      return copy;
    });
    const current = settings.hooks[event] ?? [];
    if (!current.some((entry) => JSON.stringify(entry).includes(".ai-persona/runtime"))) {
      settings.hooks[event] = [...current, ...installed];
    }
  }
  writeJson(path, settings);
}

function addClaudeMcp(path, runtime, project) {
  const config = readJson(path, {});
  config.mcpServers ??= {};
  if (config.mcpServers["ai-persona"]) throw new Error(`${path} already defines an ai-persona server.`);
  config.mcpServers["ai-persona"] = {
    command: "node",
    args: [join(runtime, "node_modules", "tsx", "dist", "cli.mjs"), join(runtime, "mcp", "server.ts")],
    cwd: project,
    env: { AI_PERSONA_PROJECT_ROOT: project },
  };
  writeJson(path, config);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function addCodexMcp(path, runtime, project) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/^\[mcp_servers\.(?:"ai-persona"|ai_persona)\]/m.test(current)) {
    throw new Error(`${path} already defines an ai-persona MCP server.`);
  }
  const section = [
    "[mcp_servers.\"ai-persona\"]",
    'command = "node"',
    `args = [${tomlString(join(runtime, "node_modules", "tsx", "dist", "cli.mjs"))}, ${tomlString(join(runtime, "mcp", "server.ts"))}]`,
    `cwd = ${tomlString(project)}`,
    "",
  ].join("\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${section}`);
}

function codexHooksDisabled(project) {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
  const configPaths = [join(codexHome, "config.toml"), join(project, ".codex", "config.toml")];
  return configPaths.some((configPath) => {
    if (!existsSync(configPath)) return false;
    const source = readFileSync(configPath, "utf8");
    const features = source.match(/^\[features\][\s\S]*?(?=^\[|$(?![\s\S]))/m)?.[0] ?? "";
    return /^hooks\s*=\s*false\b/m.test(features);
  });
}

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const project = resolve(valueAfter("--project", process.cwd()));
const agentInput = valueAfter("--agent", "").toLocaleLowerCase();
const agent = ({ "claude-code": "claude", "codex-cli": "codex", "codex-app": "codex" })[agentInput] ?? agentInput;
const source = valueAfter("--source", repository);
const approved = args.includes("--approved");
const runtimeParent = join(project, ".ai-persona");
const runtime = join(runtimeParent, "runtime");
const staging = join(runtimeParent, `.runtime-installing-${process.pid}`);
const claudeSettings = join(project, ".claude", "settings.json");
const claudeMcp = join(project, ".mcp.json");
const codexHooks = join(project, ".codex", "hooks.json");
const codexConfig = join(project, ".codex", "config.toml");
const openCodePlugin = join(project, ".opencode", "plugins", "ai-persona");
const configPaths = agent === "claude"
  ? [claudeSettings, claudeMcp]
  : agent === "codex"
    ? [codexHooks, codexConfig]
    : [join(project, "opencode.json"), join(project, "opencode.jsonc"), join(project, ".opencode", "opencode.json"), join(project, ".opencode", "opencode.jsonc")];
const snapshots = new Map();

if (!approved) throw new Error("Setup requires prior developer approval. Pass --approved only after the developer confirms the displayed plan.");
if (!existsSync(project)) throw new Error(`Project directory does not exist: ${project}`);
if (!["opencode", "claude", "codex"].includes(agent)) throw new Error("Choose --agent opencode, --agent claude, or --agent codex.");
if (!available("git")) throw new Error("Git is required to fetch the runtime.");
if (!available("npm")) throw new Error("npm is required to install runtime dependencies.");
if (agent === "opencode" && !available("opencode", ["--version"])) throw new Error("OpenCode must be installed before enabling its adapter.");
if (existsSync(runtime) || existsSync(staging)) throw new Error("Runtime already exists. Refusing to replace it.");
if (agent === "opencode" && existsSync(openCodePlugin)) throw new Error(".opencode/plugins/ai-persona already exists. Refusing to replace it.");

for (const path of configPaths) snapshots.set(path, existsSync(path) ? readFileSync(path) : null);
if (agent === "claude") {
  readJson(claudeSettings, {});
  const config = readJson(claudeMcp, {});
  if (config.mcpServers?.["ai-persona"]) throw new Error(`${claudeMcp} already defines an ai-persona server.`);
} else if (agent === "codex") {
  readJson(codexHooks, {});
  const config = existsSync(codexConfig) ? readFileSync(codexConfig, "utf8") : "";
  if (/^\[mcp_servers\.(?:"ai-persona"|ai_persona)\]/m.test(config)) throw new Error(`${codexConfig} already defines an ai-persona MCP server.`);
} else {
  const configured = configPaths.some((path) => snapshots.get(path)?.toString("utf8").includes('"ai-persona"'));
  if (configured) throw new Error("OpenCode already has an ai-persona MCP entry. Refusing to add a duplicate.");
}

mkdirSync(runtimeParent, { recursive: true });

try {
  run("git", ["clone", "--depth", "1", source, staging], project);
  run("npm", ["ci", "--omit=dev"], staging);
  renameSync(staging, runtime);

  if (agent === "opencode") {
    mkdirSync(dirname(openCodePlugin), { recursive: true });
    symlinkSync(relative(dirname(openCodePlugin), join(runtime, ".opencode", "plugins", "ai-persona")), openCodePlugin,
      process.platform === "win32" ? "junction" : "dir");
    run("opencode", ["mcp", "add", "ai-persona", "--env", `AI_PERSONA_PROJECT_ROOT=${project}`, "--", "node",
      join(".ai-persona", "runtime", "node_modules", "tsx", "dist", "cli.mjs"),
      join(".ai-persona", "runtime", "mcp", "server.ts")], project);
  } else if (agent === "claude") {
    const manifest = readJson(join(runtime, "hooks", "hooks.json"), {});
    mergeHookSettings(claudeSettings, manifest, runtime, "claude");
    addClaudeMcp(claudeMcp, runtime, project);
  } else {
    const manifest = readJson(join(runtime, "hooks", "codex-hooks.json"), {});
    mergeHookSettings(codexHooks, manifest, runtime, "codex");
    addCodexMcp(codexConfig, runtime, project);
  }

  process.stdout.write(`ai-persona runtime installed for ${agent}. Restart the agent and use persona-mode to check the active state.\n`);
  if (agent === "codex" && codexHooksDisabled(project)) {
    process.stdout.write("Warning: hooks are disabled in your Codex config. The adapter is installed but its hooks will not run; review [features].hooks before relying on guards.\n");
  }
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  rmSync(runtime, { recursive: true, force: true });
  if (agent === "opencode" && existsSync(openCodePlugin)) unlinkSync(openCodePlugin);
  for (const [path, original] of snapshots) {
    if (original === null) rmSync(path, { force: true });
    else writeFileSync(path, original);
  }
  process.stderr.write(`ai-persona setup: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
