import type { PluginInput } from "@opencode-ai/plugin"

export type SDK = PluginInput["client"]

export interface PromptBody {
  noReply: true
  tools?: Record<string, boolean>
  parts: Array<{ type: "text"; text: string }>
}

export interface PermissionReplyBody {
  response: "once" | "always" | "reject"
}

export interface PermissionEvent {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
}

export interface ToolArgs {
  filePath?: string
  path?: string
  pattern?: string
  workdir?: string
  command?: string
}
