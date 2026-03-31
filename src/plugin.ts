import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { loadDirs, saveDirs } from "./state.js"
import { validateDir } from "./validate.js"
import { permissionGlob, grantSession, grantSessionAsync, shouldGrantBeforeTool, autoApprovePermission } from "./permissions.js"
import { collectAgentContext } from "./context.js"

const SENTINEL = "__ADD_DIR_HANDLED__"

export const AddDirPlugin: Plugin = async ({ client, worktree, directory }) => {
  const root = worktree || directory
  const dirs = loadDirs()
  const sdk = client as any

  function add(dirPath: string, persist: boolean, sessionID: string): string {
    const result = validateDir(dirPath, root, [...dirs.values()].map((d) => d.path))
    if (!result.ok) return result.reason
    dirs.set(result.absolutePath, { path: result.absolutePath, persist })
    if (persist) saveDirs(dirs)
    const label = persist ? "persistent" : "session"
    const msg = `Added ${result.absolutePath} as a working directory (${label}).`
    grantSessionAsync(sdk, sessionID, msg)
    return msg
  }

  function remove(path: string): string {
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

  function handleCommand(args: string, sessionID: string): string {
    const tokens = args.trim().split(/\s+/)
    const flags = new Set(tokens.filter((t) => t.startsWith("--")))
    const pos = tokens.filter((t) => !t.startsWith("--"))

    if (pos[0] === "list") return list()
    if (pos[0] === "remove" && pos[1]) return remove(pos[1])
    if (!pos[0]) return "Usage: /add-dir <path> [--remember]\n       /add-dir list\n       /add-dir remove <path>"
    return add(pos[0], flags.has("--remember"), sessionID)
  }

  return {
    config: async (cfg: any) => {
      cfg.command ??= {}
      cfg.command["add-dir"] = { template: "/add-dir", description: "Add a working directory for this session" }
      if (!dirs.size) return
      cfg.permission ??= {}
      cfg.permission.external_directory ??= {}
      for (const entry of dirs.values())
        cfg.permission.external_directory[permissionGlob(entry.path)] = "allow"
    },

    "command.execute.before": async (input) => {
      if (input.command !== "add-dir") return
      handleCommand(input.arguments || "", input.sessionID)
      throw new Error(SENTINEL)
    },

    "tool.execute.before": async (input, output) => {
      if (shouldGrantBeforeTool(dirs, input.tool, output.args))
        await grantSession(sdk, input.sessionID, "Directory access granted by add-dir plugin.")
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "permission.asked" && event.properties)
        await autoApprovePermission(sdk, event.properties, dirs)
    },

    "experimental.chat.system.transform": async (_: any, output: { system: string[] }) => {
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
          return add(args.path, args.remember ?? false, ctx.sessionID)
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
