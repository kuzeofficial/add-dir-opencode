import type { Plugin, Config } from "@opencode-ai/plugin"
import { loadDirs, saveDirs, ensureTuiConfig } from "./state.js"
import { validateDir } from "./validate.js"
import { permissionGlob, grantSession, grantSessionAsync, notify, shouldGrantBeforeTool, autoApprovePermission } from "./permissions.js"
import { collectAgentContext } from "./context.js"
import type { SDK, PermissionEvent, ToolArgs } from "./types.js"

const SENTINEL = Object.assign(new Error("__ADD_DIR_HANDLED__"), { stack: "" })

ensureTuiConfig()

export const AddDirPlugin: Plugin = async ({ client, worktree, directory }) => {
  const root = worktree || directory
  const dirs = loadDirs()
  const sdk: SDK = client

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
    "__adddir": (args, sid) => handleAdd(args, sid),
    "list-dir": (_, sid) => notify(sdk, sid, list()),
    "remove-dir": (args, sid) => notify(sdk, sid, remove(args)),
  }

  return {
    config: async (cfg: Config) => {
      (cfg as Record<string, unknown>).command ??= {}
      const cmd = (cfg as Record<string, unknown>).command as Record<string, { template: string; description: string }>
      cmd["__adddir"] = { template: "/__adddir", description: "Internal: add a working directory" }
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
  }
}
