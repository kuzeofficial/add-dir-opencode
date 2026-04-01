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

export function expandHome(p: string) {
  return p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p
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

const PKG = "opencode-add-dir"

function stripJsonComments(text: string): string {
  let result = ""
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { result += ch; escape = false; continue }
    if (ch === "\\" && inString) { result += ch; escape = true; continue }
    if (ch === '"') { inString = !inString; result += ch; continue }
    if (inString) { result += ch; continue }
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue }
    if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue }
    result += ch
  }
  return result
}

function configDir() {
  return join(
    process.env["XDG_CONFIG_HOME"] || join(process.env["HOME"] || "~", ".config"),
    "opencode",
  )
}

function findTuiConfig(): string {
  const dir = configDir()
  for (const name of ["tui.jsonc", "tui.json"]) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return join(dir, "tui.json")
}

export function ensureTuiConfig() {
  try {
    const dir = configDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const filePath = findTuiConfig()
    let config: Record<string, unknown> = {}

    if (existsSync(filePath)) {
      config = JSON.parse(stripJsonComments(readFileSync(filePath, "utf-8")))
    }

    const plugins = (config.plugin ?? []) as unknown[]
    const hasEntry = plugins.some((p) => {
      const name = Array.isArray(p) ? p[0] : p
      return name === PKG || (typeof name === "string" && name.startsWith(PKG + "@"))
    })

    if (hasEntry) return

    config.plugin = [...plugins, PKG]
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n")
  } catch {
    // Non-critical — TUI dialog just won't be available until manually configured
  }
}
