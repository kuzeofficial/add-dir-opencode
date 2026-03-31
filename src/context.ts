import { readFileSync } from "fs"
import { join } from "path"
import type { DirEntry } from "./state.js"

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", ".agents/AGENTS.md"]

export function collectAgentContext(dirs: Map<string, DirEntry>): string[] {
  const sections: string[] = []
  for (const entry of dirs.values()) {
    for (const name of CONTEXT_FILES) {
      const fp = join(entry.path, name)
      try {
        const content = readFileSync(fp, "utf-8").trim()
        if (content) sections.push(`# Context from ${fp}\n\n${content}`)
      } catch {}
    }
  }
  return sections
}
