import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import type { Hooks, PluginInput, Config } from "@opencode-ai/plugin"
import { AddDirPlugin } from "../src/plugin"
import type { PromptBody, PermissionReplyBody, PermissionEvent } from "../src/types"

const TMP = join(tmpdir(), "add-dir-test")
const PROJECT = join(TMP, "project")
const EXTERNAL = join(TMP, "external")

interface PromptCall {
  path: { id: string }
  body: PromptBody
}

interface PermReplyCall {
  path: { id: string; permissionID: string }
  body: PermissionReplyBody
}

type Call =
  | { method: "prompt"; args: PromptCall }
  | { method: "promptAsync"; args: PromptCall }
  | { method: "permReply"; args: PermReplyCall }

function mockClient() {
  const calls: Call[] = []
  return {
    calls,
    app: { log: async () => {} },
    session: {
      prompt: async (o: PromptCall) => { calls.push({ method: "prompt", args: o }); return {} },
      promptAsync: async (o: PromptCall) => { calls.push({ method: "promptAsync", args: o }); return {} },
    },
    postSessionIdPermissionsPermissionId: async (o: PermReplyCall) => {
      calls.push({ method: "permReply", args: o }); return {}
    },
  }
}

function pluginInput(client: ReturnType<typeof mockClient>): PluginInput {
  return {
    client: client as unknown as PluginInput["client"],
    project: {} as PluginInput["project"],
    directory: PROJECT,
    worktree: PROJECT,
    serverUrl: new URL("http://localhost:4096"),
    $: (() => {}) as unknown as PluginInput["$"],
  }
}

async function createPlugin(client = mockClient()) {
  return { hooks: await AddDirPlugin(pluginInput(client)), client }
}

function findCall<M extends Call["method"]>(calls: Call[], method: M, predicate?: (args: Extract<Call, { method: M }>["args"]) => boolean) {
  return calls.find((c): c is Extract<Call, { method: M }> => c.method === method && (!predicate || predicate(c.args as Extract<Call, { method: M }>["args"])))
}

const flush = () => new Promise<void>((r) => queueMicrotask(r))

function permissionAskedEvent(id: string, sessionID: string, filepath: string, parentDir: string, patterns: string[]): { event: { type: string; properties: PermissionEvent } } {
  return {
    event: {
      type: "permission.asked",
      properties: { id, sessionID, permission: "external_directory", patterns, metadata: { filepath, parentDir }, always: patterns },
    },
  }
}

async function runCommand(hooks: Hooks, command: string, args: string, sessionID = "s1") {
  await hooks["command.execute.before"]!({ command, sessionID, arguments: args }, { parts: [] }).catch(() => {})
  await flush()
}

async function addDir(hooks: Hooks, path: string, flags = "") {
  await runCommand(hooks, "add-dir", flags ? `${path} ${flags}` : path)
}

beforeEach(() => {
  mkdirSync(PROJECT, { recursive: true })
  mkdirSync(EXTERNAL, { recursive: true })
  process.env["XDG_DATA_HOME"] = join(TMP, "data")
})

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
  delete process.env["XDG_DATA_HOME"]
})

describe("config", () => {
  test("registers all three commands", async () => {
    const { hooks } = await createPlugin()
    const cfg = {} as Config
    await hooks.config!(cfg)
    const cmd = (cfg as Record<string, unknown>).command as Record<string, { template: string }>
    expect(cmd["add-dir"].template).toBe("/add-dir")
    expect(cmd["list-dir"].template).toBe("/list-dir")
    expect(cmd["remove-dir"].template).toBe("/remove-dir")
  })

  test("injects permission rules for persisted dirs", async () => {
    const { hooks } = await createPlugin()
    await addDir(hooks, EXTERNAL, "--remember")
    const cfg = {} as Config
    await hooks.config!(cfg)
    const perm = (cfg as Record<string, unknown>).permission as Record<string, Record<string, string>>
    expect(perm.external_directory[join(EXTERNAL, "*")]).toBe("allow")
  })

  test("skips permission injection when no dirs", async () => {
    const { hooks } = await createPlugin()
    const cfg = {} as Config
    await hooks.config!(cfg)
    expect((cfg as Record<string, unknown>).permission).toBeUndefined()
  })

  test("does not expose any tools", async () => {
    const { hooks } = await createPlugin()
    expect(hooks.tool).toBeUndefined()
  })
})

describe("/add-dir command", () => {
  test("adds valid directory with grant", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    const call = findCall(client.calls, "promptAsync", (a) => !!a.body.tools?.external_directory)
    expect(call).toBeDefined()
    expect(call!.args.body.parts[0].text).toContain("Added")
    expect(call!.args.body.parts[0].text).toContain(EXTERNAL)
    expect(call!.args.body.parts[0].text).toContain("session")
  })

  test("adds with --remember flag as persistent", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL, "--remember")
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("persistent")
    expect(existsSync(join(TMP, "data", "opencode", "add-dir", "directories.json"))).toBe(true)
  })

  test("rejects nonexistent path without grant", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, "/nope/xyz")
    const call = findCall(client.calls, "promptAsync")
    expect(call).toBeDefined()
    expect(call!.args.body.tools).toBeUndefined()
    expect(call!.args.body.parts[0].text).toContain("not found")
  })

  test("rejects file path", async () => {
    writeFileSync(join(TMP, "file.txt"), "hi")
    const { hooks, client } = await createPlugin()
    await addDir(hooks, join(TMP, "file.txt"))
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("not a directory")
  })

  test("rejects path inside project", async () => {
    mkdirSync(join(PROJECT, "sub"))
    const { hooks, client } = await createPlugin()
    await addDir(hooks, join(PROJECT, "sub"))
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("already within")
  })

  test("rejects duplicate", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    client.calls.length = 0
    await addDir(hooks, EXTERNAL)
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("already accessible")
  })

  test("sends usage when no args", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, "")
    expect(findCall(client.calls, "promptAsync", (a) => a.body.parts[0].text.includes("Usage"))).toBeDefined()
  })

  test("throws sentinel", async () => {
    const { hooks } = await createPlugin()
    await expect(hooks["command.execute.before"]!({ command: "add-dir", sessionID: "s1", arguments: EXTERNAL }, { parts: [] })).rejects.toThrow()
  })
})

describe("/list-dir command", () => {
  test("lists added dirs", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL, "--remember")
    client.calls.length = 0
    await runCommand(hooks, "list-dir", "")
    const call = findCall(client.calls, "promptAsync", (a) => !a.body.tools)
    expect(call).toBeDefined()
    expect(call!.args.body.parts[0].text).toContain(EXTERNAL)
    expect(call!.args.body.parts[0].text).toContain("persistent")
  })

  test("shows empty message when no dirs", async () => {
    const { hooks, client } = await createPlugin()
    await runCommand(hooks, "list-dir", "")
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("No additional")
  })

  test("throws sentinel", async () => {
    const { hooks } = await createPlugin()
    await expect(hooks["command.execute.before"]!({ command: "list-dir", sessionID: "s1", arguments: "" }, { parts: [] })).rejects.toThrow()
  })
})

describe("/remove-dir command", () => {
  test("removes existing dir", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL, "--remember")
    client.calls.length = 0
    await runCommand(hooks, "remove-dir", EXTERNAL)
    expect(findCall(client.calls, "promptAsync", (a) => a.body.parts[0].text.includes("Removed"))).toBeDefined()
  })

  test("verifies dir is gone after remove", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await runCommand(hooks, "remove-dir", EXTERNAL)
    client.calls.length = 0
    await runCommand(hooks, "list-dir", "")
    const call = findCall(client.calls, "promptAsync")
    expect(call!.args.body.parts[0].text).toContain("No additional")
  })

  test("sends usage when no args", async () => {
    const { hooks, client } = await createPlugin()
    await runCommand(hooks, "remove-dir", "")
    expect(findCall(client.calls, "promptAsync", (a) => a.body.parts[0].text.includes("Usage"))).toBeDefined()
  })

  test("rejects unknown dir", async () => {
    const { hooks, client } = await createPlugin()
    await runCommand(hooks, "remove-dir", "/unknown")
    expect(findCall(client.calls, "promptAsync", (a) => a.body.parts[0].text.includes("not in the directory list"))).toBeDefined()
  })

  test("throws sentinel", async () => {
    const { hooks } = await createPlugin()
    await expect(hooks["command.execute.before"]!({ command: "remove-dir", sessionID: "s1", arguments: "/x" }, { parts: [] })).rejects.toThrow()
  })
})

describe("command passthrough", () => {
  test("ignores unrelated commands", async () => {
    const { hooks } = await createPlugin()
    await hooks["command.execute.before"]!({ command: "other", sessionID: "s1", arguments: "" }, { parts: [] })
  })
})

describe("tool.execute.before (subagent permission)", () => {
  test("grants permission for subagent accessing added dir", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks["tool.execute.before"]!(
      { tool: "read", sessionID: "sub-1", callID: "c1" },
      { args: { filePath: join(EXTERNAL, "f.ts") } },
    )
    expect(findCall(client.calls, "prompt", (a) => a.path.id === "sub-1")).toBeDefined()
  })

  test("caches grant per session", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "sub-2", callID: "c1" }, { args: { filePath: join(EXTERNAL, "a") } })
    await hooks["tool.execute.before"]!({ tool: "glob", sessionID: "sub-2", callID: "c2" }, { args: { path: EXTERNAL } })
    expect(client.calls.filter((c) => c.method === "prompt" && c.args.path.id === "sub-2").length).toBe(1)
  })

  test("ignores unrelated paths", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "sub-3", callID: "c1" }, { args: { filePath: "/other/f" } })
    expect(client.calls.filter((c) => c.method === "prompt" && c.args.path.id === "sub-3").length).toBe(0)
  })

  test("ignores non-file tools", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks["tool.execute.before"]!({ tool: "webfetch", sessionID: "sub-4", callID: "c1" }, { args: { filePath: join(EXTERNAL, "x") } })
    expect(client.calls.filter((c) => c.method === "prompt").length).toBe(0)
  })
})

describe("event auto-approve", () => {
  test("approves matching filepath", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks.event!(permissionAskedEvent("p1", "sub", join(EXTERNAL, "f"), EXTERNAL, [join(EXTERNAL, "*")]))
    const r = findCall(client.calls, "permReply")
    expect(r).toBeDefined()
    expect(r!.args.body.response).toBe("always")
    expect(r!.args.path.permissionID).toBe("p1")
  })

  test("approves matching pattern", async () => {
    const { hooks, client } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    await hooks.event!(permissionAskedEvent("p2", "sub", "", "", [join(EXTERNAL, "*")]))
    expect(findCall(client.calls, "permReply")).toBeDefined()
  })

  test("ignores unrelated dirs", async () => {
    const { hooks, client } = await createPlugin()
    await hooks.event!(permissionAskedEvent("p3", "s", "/other/f", "/other", ["/other/*"]))
    expect(findCall(client.calls, "permReply")).toBeUndefined()
  })

  test("ignores non-permission events", async () => {
    const { hooks, client } = await createPlugin()
    await hooks.event!({ event: { type: "session.idle" } as Parameters<NonNullable<Hooks["event"]>>[0]["event"] })
    expect(client.calls.length).toBe(0)
  })
})

describe("AGENTS.md injection", () => {
  test("injects AGENTS.md content from added dirs", async () => {
    const dir = join(TMP, "agents")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "AGENTS.md"), "# Rules")
    const { hooks } = await createPlugin()
    await addDir(hooks, dir)
    const out = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ model: {} } as Parameters<NonNullable<Hooks["experimental.chat.system.transform"]>>[0], out)
    expect(out.system[0]).toContain("Rules")
    expect(out.system[0]).toContain("Context from")
  })

  test("injects CLAUDE.md content", async () => {
    const dir = join(TMP, "claude")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "CLAUDE.md"), "# Claude rules")
    const { hooks } = await createPlugin()
    await addDir(hooks, dir)
    const out = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ model: {} } as Parameters<NonNullable<Hooks["experimental.chat.system.transform"]>>[0], out)
    expect(out.system[0]).toContain("Claude rules")
  })

  test("skips when no context files exist", async () => {
    const { hooks } = await createPlugin()
    await addDir(hooks, EXTERNAL)
    const out = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ model: {} } as Parameters<NonNullable<Hooks["experimental.chat.system.transform"]>>[0], out)
    expect(out.system.length).toBe(0)
  })
})

describe("tilde expansion", () => {
  test("expands ~/path", async () => {
    const home = process.env["HOME"]
    if (!home) return
    const { hooks, client } = await createPlugin()
    await addDir(hooks, "~/")
    const call = findCall(client.calls, "promptAsync", (a) => a.body.parts[0].text.includes("Added"))
    expect(call!.args.body.parts[0].text).toContain(home)
  })
})
