import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

function stateDir() {
  return join(
    process.env["XDG_DATA_HOME"] || join(process.env["HOME"] || "~", ".local", "share"),
    "opencode",
    "add-dir",
  )
}

export interface DirEntry {
  path: string
  persist: boolean
}

export function loadDirs(): Map<string, DirEntry> {
  const dirs = new Map<string, DirEntry>()
  const file = join(stateDir(), "directories.json")
  if (!existsSync(file)) return dirs
  try {
    for (const p of JSON.parse(readFileSync(file, "utf-8")) as string[])
      dirs.set(p, { path: p, persist: true })
  } catch {}
  return dirs
}

export function saveDirs(dirs: Map<string, DirEntry>) {
  const list = [...dirs.values()].filter((d) => d.persist).map((d) => d.path)
  const dir = stateDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "directories.json"), JSON.stringify(list, null, 2))
}

export function isChildOf(parent: string, child: string) {
  return child === parent || child.startsWith(parent + "/")
}

export function matchesDirs(dirs: Map<string, DirEntry>, filepath: string) {
  for (const entry of dirs.values()) {
    if (isChildOf(entry.path, filepath)) return true
  }
  return false
}
