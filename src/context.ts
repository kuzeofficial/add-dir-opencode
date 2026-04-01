import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { DirEntry } from "./state.js"

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", ".agents/AGENTS.md"]
function shouldInjectContext() {
  return process.env["OPENCODE_ADDDIR_INJECT_CONTEXT"] === "1"
}

export function collectAgentContext(dirs: Map<string, DirEntry>): string[] {
  if (!dirs.size) return []

  const paths = [...dirs.values()].map((d) => `- ${d.path}`)
  const sections = [`Additional working directories:\n${paths.join("\n")}`]

  if (!shouldInjectContext()) return sections

  for (const entry of dirs.values()) {
    for (const name of CONTEXT_FILES) {
      const fp = join(entry.path, name)
      if (!existsSync(fp)) continue
      const content = readFileSync(fp, "utf-8").trim()
      if (content) sections.push(`# Context from ${fp}\n\n${content}`)
    }
  }

  return sections
}
