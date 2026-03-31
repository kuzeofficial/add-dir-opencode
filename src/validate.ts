import { statSync } from "fs"
import { resolve } from "path"
import { isChildOf } from "./state.js"

export type Result = { ok: true; absolutePath: string } | { ok: false; reason: string }

function expandHome(p: string) {
  return p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p
}

export function validateDir(input: string, worktree: string, existing: string[]): Result {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: "No directory path provided." }

  const abs = resolve(expandHome(trimmed))

  try {
    if (!statSync(abs).isDirectory()) return { ok: false, reason: `${abs} is not a directory.` }
  } catch (e: any) {
    if ("ENOENT ENOTDIR EACCES EPERM".includes(e.code))
      return { ok: false, reason: `Path ${abs} was not found.` }
    throw e
  }

  if (isChildOf(worktree, abs))
    return { ok: false, reason: `${abs} is already within the project directory ${worktree}.` }

  for (const dir of existing)
    if (isChildOf(dir, abs))
      return { ok: false, reason: `${abs} is already accessible within ${dir}.` }

  return { ok: true, absolutePath: abs }
}
