import type { PluginModule } from "@opencode-ai/plugin"
import { AddDirPlugin } from "./plugin.js"

const plugin: PluginModule & { id: string } = {
  id: "opencode-add-dir",
  server: AddDirPlugin,
}

export default plugin
