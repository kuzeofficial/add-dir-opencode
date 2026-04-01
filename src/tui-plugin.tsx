import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useKeyboard } from "@opentui/solid"
import { createSignal } from "solid-js"
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs"
import { join, resolve } from "path"

const ID = "opencode-add-dir"
const DIRS_FILE = () => join(process.env["XDG_DATA_HOME"] || join(process.env["HOME"] || "~", ".local", "share"), "opencode", "add-dir", "directories.json")

function readDirs(): string[] {
  try { return JSON.parse(readFileSync(DIRS_FILE(), "utf-8")) } catch { return [] }
}

function writeDirs(dirs: string[]) {
  const dir = join(DIRS_FILE(), "..")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(DIRS_FILE(), JSON.stringify(dirs, null, 2))
}

function resolvePath(input: string) {
  const p = input.trim()
  return resolve(p.startsWith("~/") ? (process.env["HOME"] || "~") + p.slice(1) : p)
}

function validate(input: string): string | undefined {
  if (!input.trim()) return "No directory path provided."
  const abs = resolvePath(input)
  try { if (!statSync(abs).isDirectory()) return `${abs} is not a directory.` }
  catch { return `Path ${abs} was not found.` }
  if (readDirs().includes(abs)) return `${abs} is already added.`
}

function sessionID(api: TuiPluginApi): string | undefined {
  const r = api.route.current
  return r.name === "session" && r.params ? r.params.sessionID as string : undefined
}

async function withSession(api: TuiPluginApi): Promise<string | undefined> {
  const id = sessionID(api)
  if (id) return id
  const res = await api.client.session.create({})
  if (res.error) return
  api.route.navigate("session", { sessionID: res.data.id })
  return res.data.id
}

type PromptAsyncFn = (params: {
  sessionID: string
  parts: { type: "text"; text: string }[]
  noReply: boolean
  tools: Record<string, boolean>
}) => Promise<unknown>

async function grant(api: TuiPluginApi, sid: string, msg: string) {
  const promptAsync = (api.client.session as unknown as { promptAsync: PromptAsyncFn }).promptAsync
  await promptAsync({
    sessionID: sid, parts: [{ type: "text", text: msg }], noReply: true, tools: { external_directory: true },
  }).catch(() => {})
}

function AddDirDialog(props: { api: TuiPluginApi }) {
  const [busy, setBusy] = createSignal(false)
  const [remember, setRemember] = createSignal(false)
  const { api } = props

  useKeyboard((e) => {
    if (e.name !== "tab" || busy()) return
    e.preventDefault(); e.stopPropagation()
    setRemember((v) => !v)
  })

  return (
    <api.ui.DialogPrompt
      title="Add directory"
      placeholder="/path/to/directory"
      busy={busy()}
      busyText="Adding directory..."
      description={() => (
        <box gap={1}>
          <box gap={0}>
            <text fg={api.theme.current.textMuted}>To get the full path of a project:</text>
            <text fg={api.theme.current.textMuted}> 1. Move to the project in your terminal</text>
            <text fg={api.theme.current.textMuted}> 2. Run "pwd" and copy the output</text>
            <text fg={api.theme.current.textMuted}> 3. Paste below</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={remember() ? api.theme.current.text : api.theme.current.textMuted}>
              {remember() ? "[x]" : "[ ]"} Remember across sessions
            </text>
            <text fg={api.theme.current.textMuted}>(tab toggle)</text>
          </box>
        </box>
      )}
      onConfirm={async (value) => {
        const err = validate(value)
        if (err) return api.ui.toast({ variant: "error", message: err })

        setBusy(true)
        try {
          const sid = await withSession(api)
          if (!sid) return api.ui.toast({ variant: "error", message: "Failed to create session" })
          const abs = resolvePath(value)
          if (remember()) { const d = readDirs(); if (!d.includes(abs)) writeDirs([...d, abs]) }
          await grant(api, sid, `Added ${abs} as a working directory (${remember() ? "persistent" : "session"}).`)
          api.ui.dialog.clear()
        } finally { setBusy(false) }
      }}
      onCancel={() => api.ui.dialog.clear()}
    />
  )
}

function listDirs(api: TuiPluginApi) {
  const dirs = readDirs()
  if (!dirs.length) return api.ui.toast({ variant: "info", message: "No directories added." })
  api.ui.dialog.replace(() => (
    <api.ui.DialogAlert
      title={`Directories (${dirs.length})`}
      message={dirs.join("\n")}
      onConfirm={() => api.ui.dialog.clear()}
    />
  ))
}

function removeDir(api: TuiPluginApi) {
  const dirs = readDirs()
  if (!dirs.length) return api.ui.toast({ variant: "info", message: "No directories to remove." })
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title="Remove directory"
      options={dirs.map((d) => ({ title: d, value: d }))}
      onSelect={(opt) => {
        api.ui.dialog.replace(() => (
          <api.ui.DialogConfirm
            title="Remove directory"
            message={`Remove ${opt.value}?`}
            onConfirm={() => {
              writeDirs(readDirs().filter((d) => d !== opt.value))
              api.ui.toast({ variant: "success", message: `Removed ${opt.value}` })
              api.ui.dialog.clear()
            }}
            onCancel={() => removeDir(api)}
          />
        ))
      }}
    />
  ))
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    { title: "Add directory", value: "add-dir", description: "Add a working directory", category: "Directories", slash: { name: "add-dir" }, onSelect: () => api.ui.dialog.replace(() => <AddDirDialog api={api} />) },
    { title: "List directories", value: "list-dir", description: "Show working directories", category: "Directories", slash: { name: "list-dir" }, onSelect: () => listDirs(api) },
    { title: "Remove directory", value: "remove-dir", description: "Remove a working directory", category: "Directories", slash: { name: "remove-dir" }, onSelect: () => removeDir(api) },
  ])
}

export default { id: ID, tui } satisfies TuiPluginModule & { id: string }
