#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const PKG = "opencode-add-dir"

try {
  const dir = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "opencode",
  )
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  let filePath = join(dir, "tui.json")
  for (const name of ["tui.jsonc", "tui.json"]) {
    const p = join(dir, name)
    if (existsSync(p)) { filePath = p; break }
  }

  let config = {}
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8")
    config = JSON.parse(raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))
  }

  const plugins = config.plugin || []
  const has = plugins.some((p) => {
    const name = Array.isArray(p) ? p[0] : p
    return name === PKG || (typeof name === "string" && name.startsWith(PKG + "@"))
  })

  if (!has) {
    config.plugin = [...plugins, PKG]
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n")
  }
} catch {
  // Non-critical — TUI dialog available after manual setup or restart
}
