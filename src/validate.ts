import { statSync } from "fs"
import { resolve } from "path"
import { isChildOf, expandHome } from "./state.js"

export type Result = { ok: true; absolutePath: string } | { ok: false; reason: string }

export function validateDir(input: string, worktree: string, existing: string[]): Result {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: "No directory path provided." }

  const abs = resolve(expandHome(trimmed))

  try {
    if (!statSync(abs).isDirectory()) return { ok: false, reason: `${abs} is not a directory.` }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code))
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
