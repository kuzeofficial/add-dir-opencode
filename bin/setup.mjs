#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const PKG = "opencode-add-dir"
const isRemove = process.argv.includes("--remove")
const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode")

function findFile(base) {
  for (const ext of [".jsonc", ".json"]) {
    const p = join(dir, base + ext)
    if (existsSync(p)) return p
  }
  return join(dir, base + ".json")
}

function readConfig(path) {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, "utf-8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))
}

function hasPlugin(plugins) {
  return plugins.some((p) => {
    const n = Array.isArray(p) ? p[0] : p
    return n === PKG || n.startsWith(PKG + "@")
  })
}

function patch(path, schema) {
  const config = readConfig(path)
  config.plugin ??= []

  if (isRemove) {
    if (!hasPlugin(config.plugin)) return false
    config.plugin = config.plugin.filter((p) => {
      const n = Array.isArray(p) ? p[0] : p
      return n !== PKG && !n.startsWith(PKG + "@")
    })
  } else {
    if (hasPlugin(config.plugin)) return false
    config.plugin.push(PKG)
    if (schema && !config.$schema) config.$schema = schema
  }

  writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
  return true
}

if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

for (const [label, path, schema] of [
  ["server", findFile("opencode"), "https://opencode.ai/config.json"],
  ["tui", findFile("tui")],
]) {
  if (patch(path, schema)) console.log(`${isRemove ? "Removed from" : "Added to"} ${label}: ${path}`)
  else console.log(`${label}: already ${isRemove ? "absent" : "configured"}`)
}
