#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const PKG = "opencode-add-dir"
const args = process.argv.slice(2)
const isRemove = args.includes("--remove")

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")
  if (process.platform === "darwin") return join(homedir(), ".config", "opencode")
  return join(homedir(), ".config", "opencode")
}

function findConfig() {
  const dir = configDir()
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return join(dir, "opencode.json")
}

function stripJsonComments(text) {
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

function run() {
  const configPath = findConfig()
  const dir = configDir()

  let config = {}
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8")
    config = JSON.parse(stripJsonComments(raw))
  } else {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  config.plugin = config.plugin || []
  const has = config.plugin.some((p) => {
    const name = Array.isArray(p) ? p[0] : p
    return name === PKG || name.startsWith(PKG + "@")
  })

  if (isRemove) {
    if (!has) {
      console.log(`${PKG} is not in ${configPath}`)
      return
    }
    config.plugin = config.plugin.filter((p) => {
      const name = Array.isArray(p) ? p[0] : p
      return name !== PKG && !name.startsWith(PKG + "@")
    })
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
    console.log(`Removed ${PKG} from ${configPath}`)
    return
  }

  if (has) {
    console.log(`${PKG} is already in ${configPath}`)
    return
  }

  config.plugin.push(PKG)
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json"
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
  console.log(`Added ${PKG} to ${configPath}`)
  console.log("Restart OpenCode to activate the plugin.")
}

run()
