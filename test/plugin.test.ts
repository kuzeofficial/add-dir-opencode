import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { AddDirPlugin } from "../src/plugin"

const TMP = join(tmpdir(), "add-dir-test")
const PROJECT = join(TMP, "project")
const EXTERNAL = join(TMP, "external")

function mockClient() {
  const calls: { method: string; args: any }[] = []
  return {
    calls,
    app: { log: async () => {} },
    session: {
      prompt: async (o: any) => { calls.push({ method: "prompt", args: o }); return {} },
      promptAsync: async (o: any) => { calls.push({ method: "promptAsync", args: o }); return {} },
    },
    postSessionIdPermissionsPermissionId: async (o: any) => {
      calls.push({ method: "permReply", args: o }); return {}
    },
  }
}

function ctx(sid = "s1") {
  return {
    sessionID: sid, messageID: "m1", agent: "coder",
    directory: PROJECT, worktree: PROJECT,
    abort: new AbortController().signal, metadata: () => {}, ask: async () => {},
  }
}

function pluginInput(client: any) {
  return { client, project: {} as any, directory: PROJECT, worktree: PROJECT, serverUrl: new URL("http://localhost:4096"), $: {} as any }
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
  test("registers command", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    const cfg: any = {}
    await h.config!(cfg)
    expect(cfg.command["add-dir"].template).toBe("/add-dir")
  })

  test("injects permission rules for persisted dirs", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await h.tool!.add_dir.execute({ path: EXTERNAL, remember: true }, ctx())
    const cfg: any = {}
    await h.config!(cfg)
    expect(cfg.permission.external_directory[join(EXTERNAL, "*")]).toBe("allow")
  })
})

describe("add_dir", () => {
  test("adds valid directory", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    expect(await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())).toContain("Added")
  })

  test("rejects nonexistent", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    expect(await h.tool!.add_dir.execute({ path: "/nope/xyz" }, ctx())).toContain("not found")
  })

  test("rejects inside project", async () => {
    mkdirSync(join(PROJECT, "sub"))
    const h = await AddDirPlugin(pluginInput(mockClient()))
    expect(await h.tool!.add_dir.execute({ path: join(PROJECT, "sub") }, ctx())).toContain("already within")
  })

  test("rejects duplicate", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    expect(await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())).toContain("already accessible")
  })

  test("fires promptAsync for session permission", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    await new Promise((r) => setTimeout(r, 200))
    expect(c.calls.some((x) => x.method === "promptAsync" && x.args.body.tools.external_directory)).toBe(true)
  })
})

describe("list / remove", () => {
  test("list empty", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    expect(await h.tool!.list_dirs.execute({}, ctx())).toContain("No additional")
  })

  test("remove", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    expect(await h.tool!.remove_dir.execute({ path: EXTERNAL }, ctx())).toContain("Removed")
  })
})

describe("tool.execute.before", () => {
  test("grants subagent session", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    await h["tool.execute.before"]!(
      { tool: "read", sessionID: "sub-1", callID: "c" },
      { args: { filePath: join(EXTERNAL, "f.ts") } },
    )
    expect(c.calls.some((x) => x.method === "prompt" && x.args.path.id === "sub-1")).toBe(true)
  })

  test("caches per session", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    await h["tool.execute.before"]!({ tool: "read", sessionID: "sub-2", callID: "c1" }, { args: { filePath: join(EXTERNAL, "a") } })
    await h["tool.execute.before"]!({ tool: "glob", sessionID: "sub-2", callID: "c2" }, { args: { path: EXTERNAL } })
    expect(c.calls.filter((x) => x.method === "prompt" && x.args.path.id === "sub-2").length).toBe(1)
  })

  test("ignores unrelated paths", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    await h["tool.execute.before"]!({ tool: "read", sessionID: "sub-3", callID: "c" }, { args: { filePath: "/other/f" } })
    expect(c.calls.filter((x) => x.method === "prompt" && x.args.path.id === "sub-3").length).toBe(0)
  })
})

describe("event auto-approve", () => {
  test("approves via SDK", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.tool!.add_dir.execute({ path: EXTERNAL }, ctx())
    await h.event!({ event: {
      type: "permission.asked",
      properties: { id: "p1", sessionID: "sub", permission: "external_directory", patterns: [join(EXTERNAL, "*")], metadata: { filepath: join(EXTERNAL, "f"), parentDir: EXTERNAL }, always: [] },
    } as any })
    const r = c.calls.find((x) => x.method === "permReply")
    expect(r?.args.body.response).toBe("always")
  })

  test("ignores unrelated", async () => {
    const c = mockClient()
    const h = await AddDirPlugin(pluginInput(c))
    await h.event!({ event: { type: "permission.asked", properties: { id: "p2", sessionID: "s", permission: "external_directory", patterns: ["/other/*"], metadata: { filepath: "/other/f", parentDir: "/other" }, always: [] } } as any })
    expect(c.calls.filter((x) => x.method === "permReply").length).toBe(0)
  })
})

describe("AGENTS.md injection", () => {
  test("injects from added dirs", async () => {
    const dir = join(TMP, "agents")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "AGENTS.md"), "# Rules")
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await h.tool!.add_dir.execute({ path: dir }, ctx())
    const out = { system: [] as string[] }
    await h["experimental.chat.system.transform"]!({} as any, out)
    expect(out.system[0]).toContain("Rules")
  })
})

describe("command", () => {
  test("throws sentinel", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await expect(h["command.execute.before"]!({ command: "add-dir", sessionID: "s1", arguments: EXTERNAL }, { parts: [] })).rejects.toThrow()
  })

  test("ignores other commands", async () => {
    const h = await AddDirPlugin(pluginInput(mockClient()))
    await h["command.execute.before"]!({ command: "other", sessionID: "s1", arguments: "" }, { parts: [] })
  })
})
