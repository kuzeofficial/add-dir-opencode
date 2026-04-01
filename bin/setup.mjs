#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const PKG = "opencode-add-dir"
const args = process.argv.slice(2)
const isRemove = args.includes("--remove")

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")
  return join(homedir(), ".config", "opencode")
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

function findConfigFile(dir, baseName) {
  for (const ext of [".jsonc", ".json"]) {
    const p = join(dir, baseName + ext)
    if (existsSync(p)) return p
  }
  return join(dir, baseName + ".json")
}

function readConfig(filePath) {
  if (!existsSync(filePath)) return {}
  return JSON.parse(stripJsonComments(readFileSync(filePath, "utf-8")))
}

function hasPlugin(plugins) {
  return (plugins || []).some((p) => {
    const name = Array.isArray(p) ? p[0] : p
    return name === PKG || name.startsWith(PKG + "@")
  })
}

function withoutPlugin(plugins) {
  return (plugins || []).filter((p) => {
    const name = Array.isArray(p) ? p[0] : p
    return name !== PKG && !name.startsWith(PKG + "@")
  })
}

function patchConfig(filePath, config, schemaUrl) {
  config.plugin = config.plugin || []

  if (isRemove) {
    if (!hasPlugin(config.plugin)) return false
    config.plugin = withoutPlugin(config.plugin)
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n")
    return true
  }

  if (hasPlugin(config.plugin)) return false
  config.plugin.push(PKG)
  if (schemaUrl && !config.$schema) config.$schema = schemaUrl
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n")
  return true
}

function run() {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const serverPath = findConfigFile(dir, "opencode")
  const tuiPath = findConfigFile(dir, "tui")

  const serverConfig = readConfig(serverPath)
  const tuiConfig = readConfig(tuiPath)

  const verb = isRemove ? "Removed" : "Added"
  const serverChanged = patchConfig(serverPath, serverConfig, "https://opencode.ai/config.json")
  const tuiChanged = patchConfig(tuiPath, tuiConfig)

  if (serverChanged) console.log(`${verb} ${PKG} in ${serverPath}`)
  else console.log(`${PKG} already ${isRemove ? "absent from" : "in"} ${serverPath}`)

  if (tuiChanged) console.log(`${verb} ${PKG} in ${tuiPath}`)
  else console.log(`${PKG} already ${isRemove ? "absent from" : "in"} ${tuiPath}`)

  if (serverChanged || tuiChanged) {
    console.log("Restart OpenCode to activate the plugin.")
  }
}

run()
