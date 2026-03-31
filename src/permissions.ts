import { join, resolve } from "path"
import type { DirEntry } from "./state.js"
import { matchesDirs } from "./state.js"

const FILE_TOOLS = new Set(["read", "write", "edit", "apply_patch", "multiedit", "glob", "grep", "list", "bash"])
const grantedSessions = new Set<string>()

function expandHome(p: string) {
  return p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p
}

function extractPath(tool: string, args: any): string {
  if (!args) return ""
  if (tool === "bash") return args.workdir || args.command || ""
  return args.filePath || args.path || args.pattern || ""
}

export function permissionGlob(dirPath: string) {
  return join(dirPath, "*")
}

export async function grantSession(sdk: any, sessionID: string, text: string) {
  if (grantedSessions.has(sessionID)) return
  grantedSessions.add(sessionID)
  await sdk.session
    .prompt({
      path: { id: sessionID },
      body: { noReply: true, tools: { external_directory: true }, parts: [{ type: "text", text }] },
    })
    .catch(() => {})
}

export function grantSessionAsync(sdk: any, sessionID: string, text: string) {
  setTimeout(() => {
    sdk.session
      .promptAsync({
        path: { id: sessionID },
        body: { noReply: true, tools: { external_directory: true }, parts: [{ type: "text", text }] },
      })
      ?.then?.(() => grantedSessions.add(sessionID))
      ?.catch?.(() => {})
  }, 150)
}

export function shouldGrantBeforeTool(
  dirs: Map<string, DirEntry>,
  tool: string,
  args: any,
): boolean {
  if (!dirs.size || !FILE_TOOLS.has(tool)) return false
  const p = extractPath(tool, args)
  return !!p && matchesDirs(dirs, resolve(expandHome(p)))
}

export async function autoApprovePermission(sdk: any, props: any, dirs: Map<string, DirEntry>) {
  if (props.permission !== "external_directory") return

  const meta = (props.metadata ?? {}) as Record<string, unknown>
  const filepath = (meta.filepath as string) ?? ""
  const parentDir = (meta.parentDir as string) ?? ""
  const patterns = (props.patterns as string[]) ?? []

  const matches =
    matchesDirs(dirs, filepath) ||
    matchesDirs(dirs, parentDir) ||
    patterns.some((p: string) => matchesDirs(dirs, p.replace(/\/?\*$/, "")))

  if (!matches || !props.id || !props.sessionID) return

  await sdk
    .postSessionIdPermissionsPermissionId({
      path: { id: props.sessionID, permissionID: props.id },
      body: { response: "always" },
    })
    .catch(() => {})
}
