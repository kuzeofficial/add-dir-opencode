import type { Plugin, Config } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { loadDirs, saveDirs } from "./state.js"
import { validateDir } from "./validate.js"
import { permissionGlob, grantSession, grantSessionAsync, notify, shouldGrantBeforeTool, autoApprovePermission } from "./permissions.js"
import { collectAgentContext } from "./context.js"
import type { SDK, PermissionEvent, ToolArgs } from "./types.js"

const SENTINEL = Object.assign(new Error("__ADD_DIR_HANDLED__"), { stack: "" })

function log(msg: string, data?: unknown) {
  console.error(`[add-dir] ${msg}`, data !== undefined ? JSON.stringify(data) : "")
}

export const AddDirPlugin: Plugin = async ({ client, worktree, directory }) => {
  const root = worktree || directory
  const dirs = loadDirs()
  const sdk: SDK = client

  log("init", { root, persistedDirs: [...dirs.keys()] })

  function add(dirPath: string, persist: boolean): { ok: boolean; message: string } {
    const result = validateDir(dirPath, root, [...dirs.values()].map((d) => d.path))
    if (!result.ok) return { ok: false, message: result.reason }
    dirs.set(result.absolutePath, { path: result.absolutePath, persist })
    if (persist) saveDirs(dirs)
    const label = persist ? "persistent" : "session"
    return { ok: true, message: `Added ${result.absolutePath} as a working directory (${label}).` }
  }

  function remove(path: string): string {
    if (!path?.trim()) return "Usage: /remove-dir <path>"
    if (!dirs.has(path)) return `${path} is not in the directory list.`
    dirs.delete(path)
    saveDirs(dirs)
    return `Removed ${path} from working directories.`
  }

  function list(): string {
    if (!dirs.size) return "No additional directories added."
    return [...dirs.values()]
      .map((d) => `${d.path} (${d.persist ? "persistent" : "session"})`)
      .join("\n")
  }

  function handleAdd(args: string, sessionID: string) {
    const tokens = args.trim().split(/\s+/)
    const flags = new Set(tokens.filter((t) => t.startsWith("--")))
    const pos = tokens.filter((t) => !t.startsWith("--"))
    if (!pos[0]) return notify(sdk, sessionID, "Usage: /add-dir <path> [--remember]")
    const result = add(pos[0], flags.has("--remember"))
    if (result.ok) grantSessionAsync(sdk, sessionID, result.message)
    else notify(sdk, sessionID, result.message)
  }

  const commands: Record<string, (args: string, sid: string) => void> = {
    "add-dir": (args, sid) => { log("add-dir", { args, sid }); handleAdd(args, sid) },
    "list-dir": (_, sid) => { log("list-dir", { sid }); notify(sdk, sid, list()) },
    "remove-dir": (args, sid) => { log("remove-dir", { args, sid }); notify(sdk, sid, remove(args)) },
  }

  return {
    config: async (cfg: Config) => {
      (cfg as Record<string, unknown>).command ??= {}
      const cmd = (cfg as Record<string, unknown>).command as Record<string, { template: string; description: string }>
      cmd["add-dir"] = { template: "/add-dir", description: "Add a working directory" }
      cmd["list-dir"] = { template: "/list-dir", description: "List added working directories" }
      cmd["remove-dir"] = { template: "/remove-dir", description: "Remove a working directory" }
      if (!dirs.size) return
      const perm = ((cfg as Record<string, unknown>).permission ??= {}) as Record<string, unknown>
      const extDir = (perm.external_directory ??= {}) as Record<string, string>
      for (const entry of dirs.values())
        extDir[permissionGlob(entry.path)] = "allow"
    },

    "command.execute.before": async (input) => {
      const handler = commands[input.command]
      if (!handler) return
      handler(input.arguments || "", input.sessionID)
      throw SENTINEL
    },

    "tool.execute.before": async (input, output) => {
      if (shouldGrantBeforeTool(dirs, input.tool, output.args as ToolArgs))
        await grantSession(sdk, input.sessionID, "Directory access granted by add-dir plugin.")
    },

    event: async ({ event }) => {
      const e = event as { type: string; properties?: PermissionEvent }
      if (e.type === "permission.asked" && e.properties)
        await autoApprovePermission(sdk, e.properties, dirs)
    },

    "experimental.chat.system.transform": async (_input, output) => {
      output.system.push(...collectAgentContext(dirs))
    },

    tool: {
      add_dir: tool({
        description: "Add an external directory as a working directory. Files in added directories can be read and edited without permission prompts.",
        args: {
          path: tool.schema.string().describe("Absolute or relative path to directory"),
          remember: tool.schema.boolean().optional().describe("Persist across sessions"),
        },
        async execute(args, ctx) {
          const result = add(args.path, args.remember ?? false)
          if (result.ok) grantSessionAsync(sdk, ctx.sessionID, result.message)
          return result.message
        },
      }),

      list_dirs: tool({
        description: "List all added working directories.",
        args: {},
        async execute() { return list() },
      }),

      remove_dir: tool({
        description: "Remove a previously added working directory.",
        args: { path: tool.schema.string().describe("Path of directory to remove") },
        async execute(args) { return remove(args.path) },
      }),
    },
  }
}
