import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"

const PLUGIN_ID = "opencode-add-dir"
const COMMAND_NAME = "add-dir"

function activeSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session" || !route.params) return
  return route.params.sessionID as string
}

async function ensureSession(api: TuiPluginApi): Promise<string | undefined> {
  const existing = activeSessionID(api)
  if (existing) return existing

  const res = await api.client.session.create({})
  if (res.error) return

  api.route.navigate("session", { sessionID: res.data.id })
  return res.data.id
}

async function executeAddDir(api: TuiPluginApi, dirPath: string) {
  const sessionID = await ensureSession(api)
  if (!sessionID) {
    api.ui.toast({ variant: "error", message: "Failed to create session" })
    return
  }

  // The server plugin intercepts via command.execute.before, handles the logic,
  // sends feedback through the session event stream, then throws SENTINEL to
  // prevent the command template from reaching the LLM. This rejection is expected.
  api.client.session.command({
    sessionID,
    command: COMMAND_NAME,
    arguments: dirPath,
  }).catch(() => {})
}

function AddDirDialog(props: { api: TuiPluginApi }) {
  const [busy, setBusy] = createSignal(false)

  async function handleConfirm(value: string) {
    const dirPath = value.trim()
    if (!dirPath) {
      props.api.ui.toast({ variant: "error", message: "Please enter a directory path" })
      return
    }

    setBusy(true)
    try {
      await executeAddDir(props.api, dirPath)
      props.api.ui.dialog.clear()
    } finally {
      setBusy(false)
    }
  }

  return (
    <props.api.ui.DialogPrompt
      title="Add directory"
      placeholder="/path/to/directory"
      busy={busy()}
      busyText="Adding directory..."
      description={() => (
        <box gap={0}>
          <text fg={props.api.theme.current.textMuted}>
            To get the full path of a project:
          </text>
          <text fg={props.api.theme.current.textMuted}>
            {" "}1. Move to the project in your terminal
          </text>
          <text fg={props.api.theme.current.textMuted}>
            {" "}2. Run "pwd" and copy the output
          </text>
          <text fg={props.api.theme.current.textMuted}>
            {" "}3. Paste below
          </text>
        </box>
      )}
      onConfirm={handleConfirm}
      onCancel={() => props.api.ui.dialog.clear()}
    />
  )
}

function showDialog(api: TuiPluginApi) {
  api.ui.dialog.replace(() => <AddDirDialog api={api} />)
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Add directory",
      value: "add-dir.dialog",
      description: "Add a working directory to the session",
      category: "Directories",
      slash: { name: COMMAND_NAME },
      onSelect: () => showDialog(api),
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
