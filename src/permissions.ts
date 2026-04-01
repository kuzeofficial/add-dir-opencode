import { resolve } from "path"
import type { DirEntry } from "./state.js"
import { matchesDirs, expandHome } from "./state.js"
import type { SDK, PermissionEvent, ToolArgs } from "./types.js"

const FILE_TOOLS = new Set(["read", "write", "edit", "apply_patch", "multiedit", "glob", "grep", "list", "bash"])
const grantedSessions = new Set<string>()

export function resetGrantedSessions() { grantedSessions.clear() }

export function permissionGlob(dirPath: string) {
  return dirPath + "/*"
}

export async function grantSession(sdk: SDK, sessionID: string) {
  if (grantedSessions.has(sessionID)) return
  grantedSessions.add(sessionID)
  await (sdk.session.prompt as Function)({
    path: { id: sessionID },
    body: { noReply: true, tools: { external_directory: true }, parts: [] },
  }).catch(() => {})
}

export function shouldGrantBeforeTool(dirs: Map<string, DirEntry>, tool: string, args: ToolArgs): boolean {
  if (!dirs.size || !FILE_TOOLS.has(tool)) return false
  const p = extractPath(tool, args)
  return !!p && matchesDirs(dirs, resolve(expandHome(p)))
}

export async function autoApprovePermission(sdk: SDK, props: PermissionEvent, dirs: Map<string, DirEntry>) {
  if (props.permission !== "external_directory") return

  const { filepath = "", parentDir = "" } = props.metadata as { filepath?: string; parentDir?: string }
  const patterns = props.patterns ?? []

  const matches =
    matchesDirs(dirs, filepath) ||
    matchesDirs(dirs, parentDir) ||
    patterns.some((p) => matchesDirs(dirs, p.replace(/\/?\*$/, "")))

  if (!matches || !props.id || !props.sessionID) return

  await (sdk as ReturnType<typeof import("@opencode-ai/sdk").createOpencodeClient>)
    .postSessionIdPermissionsPermissionId({
      path: { id: props.sessionID, permissionID: props.id },
      body: { response: "always" },
    })
    .catch(() => {})
}

export function extractPath(tool: string, args: ToolArgs): string {
  if (!args) return ""
  if (tool === "bash") return args.workdir || args.command || ""
  return args.filePath || args.path || args.pattern || ""
}
