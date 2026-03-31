// src/plugin.ts
import { tool } from "@opencode-ai/plugin";

// src/state.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
function stateDir() {
  return join(process.env["XDG_DATA_HOME"] || join(process.env["HOME"] || "~", ".local", "share"), "opencode", "add-dir");
}
function loadDirs() {
  const dirs = new Map;
  const file = join(stateDir(), "directories.json");
  if (!existsSync(file))
    return dirs;
  try {
    for (const p of JSON.parse(readFileSync(file, "utf-8")))
      dirs.set(p, { path: p, persist: true });
  } catch {}
  return dirs;
}
function saveDirs(dirs) {
  const list = [...dirs.values()].filter((d) => d.persist).map((d) => d.path);
  const dir = stateDir();
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "directories.json"), JSON.stringify(list, null, 2));
}
function isChildOf(parent, child) {
  return child === parent || child.startsWith(parent + "/");
}
function matchesDirs(dirs, filepath) {
  for (const entry of dirs.values()) {
    if (isChildOf(entry.path, filepath))
      return true;
  }
  return false;
}

// src/validate.ts
import { statSync } from "fs";
import { resolve } from "path";
function expandHome(p) {
  return p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p;
}
function validateDir(input, worktree, existing) {
  const trimmed = input.trim();
  if (!trimmed)
    return { ok: false, reason: "No directory path provided." };
  const abs = resolve(expandHome(trimmed));
  try {
    if (!statSync(abs).isDirectory())
      return { ok: false, reason: `${abs} is not a directory.` };
  } catch (e) {
    if ("ENOENT ENOTDIR EACCES EPERM".includes(e.code))
      return { ok: false, reason: `Path ${abs} was not found.` };
    throw e;
  }
  if (isChildOf(worktree, abs))
    return { ok: false, reason: `${abs} is already within the project directory ${worktree}.` };
  for (const dir of existing)
    if (isChildOf(dir, abs))
      return { ok: false, reason: `${abs} is already accessible within ${dir}.` };
  return { ok: true, absolutePath: abs };
}

// src/permissions.ts
import { join as join2, resolve as resolve2 } from "path";
var FILE_TOOLS = new Set(["read", "write", "edit", "apply_patch", "multiedit", "glob", "grep", "list", "bash"]);
var grantedSessions = new Set;
function expandHome2(p) {
  return p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p;
}
function extractPath(tool, args) {
  if (!args)
    return "";
  if (tool === "bash")
    return args.workdir || args.command || "";
  return args.filePath || args.path || args.pattern || "";
}
function permissionGlob(dirPath) {
  return join2(dirPath, "*");
}
async function grantSession(sdk, sessionID, text) {
  if (grantedSessions.has(sessionID))
    return;
  grantedSessions.add(sessionID);
  await sdk.session.prompt({
    path: { id: sessionID },
    body: { noReply: true, tools: { external_directory: true }, parts: [{ type: "text", text }] }
  }).catch(() => {});
}
function grantSessionAsync(sdk, sessionID, text) {
  setTimeout(() => {
    sdk.session.promptAsync({
      path: { id: sessionID },
      body: { noReply: true, tools: { external_directory: true }, parts: [{ type: "text", text }] }
    })?.then?.(() => grantedSessions.add(sessionID))?.catch?.(() => {});
  }, 150);
}
function shouldGrantBeforeTool(dirs, tool, args) {
  if (!dirs.size || !FILE_TOOLS.has(tool))
    return false;
  const p = extractPath(tool, args);
  return !!p && matchesDirs(dirs, resolve2(expandHome2(p)));
}
async function autoApprovePermission(sdk, props, dirs) {
  if (props.permission !== "external_directory")
    return;
  const meta = props.metadata ?? {};
  const filepath = meta.filepath ?? "";
  const parentDir = meta.parentDir ?? "";
  const patterns = props.patterns ?? [];
  const matches = matchesDirs(dirs, filepath) || matchesDirs(dirs, parentDir) || patterns.some((p) => matchesDirs(dirs, p.replace(/\/?\*$/, "")));
  if (!matches || !props.id || !props.sessionID)
    return;
  await sdk.postSessionIdPermissionsPermissionId({
    path: { id: props.sessionID, permissionID: props.id },
    body: { response: "always" }
  }).catch(() => {});
}

// src/context.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "fs";
import { join as join3 } from "path";
var CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", ".agents/AGENTS.md"];
function collectAgentContext(dirs) {
  const sections = [];
  for (const entry of dirs.values()) {
    for (const name of CONTEXT_FILES) {
      const fp = join3(entry.path, name);
      if (!existsSync2(fp))
        continue;
      try {
        const content = readFileSync2(fp, "utf-8").trim();
        if (content)
          sections.push(`# Context from ${fp}

${content}`);
      } catch {}
    }
  }
  return sections;
}

// src/plugin.ts
var SENTINEL = "__ADD_DIR_HANDLED__";
var AddDirPlugin = async ({ client, worktree, directory }) => {
  const root = worktree || directory;
  const dirs = loadDirs();
  const sdk = client;
  function add(dirPath, persist, sessionID) {
    const result = validateDir(dirPath, root, [...dirs.values()].map((d) => d.path));
    if (!result.ok)
      return result.reason;
    dirs.set(result.absolutePath, { path: result.absolutePath, persist });
    if (persist)
      saveDirs(dirs);
    const label = persist ? "persistent" : "session";
    const msg = `Added ${result.absolutePath} as a working directory (${label}).`;
    grantSessionAsync(sdk, sessionID, msg);
    return msg;
  }
  function remove(path) {
    if (!dirs.has(path))
      return `${path} is not in the directory list.`;
    dirs.delete(path);
    saveDirs(dirs);
    return `Removed ${path} from working directories.`;
  }
  function list() {
    if (!dirs.size)
      return "No additional directories added.";
    return [...dirs.values()].map((d) => `${d.path} (${d.persist ? "persistent" : "session"})`).join(`
`);
  }
  function handleCommand(args, sessionID) {
    const tokens = args.trim().split(/\s+/);
    const flags = new Set(tokens.filter((t) => t.startsWith("--")));
    const pos = tokens.filter((t) => !t.startsWith("--"));
    if (pos[0] === "list")
      return list();
    if (pos[0] === "remove" && pos[1])
      return remove(pos[1]);
    if (!pos[0])
      return `Usage: /add-dir <path> [--remember]
       /add-dir list
       /add-dir remove <path>`;
    return add(pos[0], flags.has("--remember"), sessionID);
  }
  return {
    config: async (cfg) => {
      cfg.command ??= {};
      cfg.command["add-dir"] = { template: "/add-dir", description: "Add a working directory for this session" };
      if (!dirs.size)
        return;
      cfg.permission ??= {};
      cfg.permission.external_directory ??= {};
      for (const entry of dirs.values())
        cfg.permission.external_directory[permissionGlob(entry.path)] = "allow";
    },
    "command.execute.before": async (input) => {
      if (input.command !== "add-dir")
        return;
      handleCommand(input.arguments || "", input.sessionID);
      throw new Error(SENTINEL);
    },
    "tool.execute.before": async (input, output) => {
      if (shouldGrantBeforeTool(dirs, input.tool, output.args))
        await grantSession(sdk, input.sessionID, "Directory access granted by add-dir plugin.");
    },
    event: async ({ event }) => {
      if (event.type === "permission.asked" && event.properties)
        await autoApprovePermission(sdk, event.properties, dirs);
    },
    "experimental.chat.system.transform": async (_, output) => {
      output.system.push(...collectAgentContext(dirs));
    },
    tool: {
      add_dir: tool({
        description: "Add an external directory as a working directory. Files in added directories can be read and edited without permission prompts.",
        args: {
          path: tool.schema.string().describe("Absolute or relative path to directory"),
          remember: tool.schema.boolean().optional().describe("Persist across sessions")
        },
        async execute(args, ctx) {
          return add(args.path, args.remember ?? false, ctx.sessionID);
        }
      }),
      list_dirs: tool({
        description: "List all added working directories.",
        args: {},
        async execute() {
          return list();
        }
      }),
      remove_dir: tool({
        description: "Remove a previously added working directory.",
        args: { path: tool.schema.string().describe("Path of directory to remove") },
        async execute(args) {
          return remove(args.path);
        }
      })
    }
  };
};

// src/index.ts
var src_default = AddDirPlugin;
export {
  src_default as default
};
