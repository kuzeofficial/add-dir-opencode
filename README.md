# opencode-add-dir

Add working directories to your [OpenCode](https://opencode.ai) session — inspired by Claude Code's [`/add-dir`](https://docs.anthropic.com/en/docs/claude-code/cli-usage#add-dir) command.

When you need an agent to read, edit, or search files outside the current project, this plugin grants access without permission popups.

## Quick Start

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-add-dir"]
}
```

Restart OpenCode. Done.

<details>
<summary>Alternative: setup CLI</summary>

```bash
bunx opencode-add-dir-setup
```

Automatically adds the plugin to your global `opencode.json`.

</details>

<details>
<summary>Alternative: local file</summary>

```bash
git clone https://github.com/kuzeofficial/add-dir-opencode.git
cd add-dir-opencode
bun install && bun run deploy
```

Bundles to `~/.config/opencode/plugins/add-dir.js`.

</details>

## Commands

```
/add-dir /path/to/directory              # Add for this session
/add-dir /path/to/directory --remember   # Persist across sessions
/list-dir                                # Show added directories
/remove-dir /path/to/directory           # Remove a directory
```

## How It Works

The plugin uses a layered approach to handle permissions across all sessions, including subagents:

| Layer | When | Scope |
|-------|------|-------|
| **Config hook** | Startup | Injects `external_directory: "allow"` rules for persisted dirs into all agents |
| **Session permission** | `/add-dir` | Sets `external_directory: true` on the current session |
| **tool.execute.before** | Every file tool | Detects subagent sessions accessing added dirs, grants permission before execution |
| **Event auto-approve** | Permission popup | Catches any remaining `external_directory` requests and auto-approves via SDK |

### Context Injection

If an added directory contains `AGENTS.md`, `CLAUDE.md`, or `.agents/AGENTS.md`, the content is automatically injected into the system prompt.

## Persistence

Directories added with `--remember` are stored in:

```
~/.local/share/opencode/add-dir/directories.json
```

These are loaded at startup and injected into agent permission rules via the config hook.

## Development

```bash
bun install
bun test           # 33 tests
bun run typecheck  # Type check
bun run build      # Build npm package
bun run deploy     # Bundle to ~/.config/opencode/plugins/
```

### Project Structure

```
src/
├── index.ts        # Entry point (default export)
├── plugin.ts       # Hooks + commands
├── state.ts        # Persistence + path utils
├── validate.ts     # Directory validation
├── permissions.ts  # Session grants + auto-approve
├── context.ts      # AGENTS.md injection
└── types.ts        # Shared type definitions
```

## Debugging

```bash
opencode --print-logs 2>debug.log
grep "\[add-dir\]" debug.log
```

## Limitations

- Directories added mid-session (without `--remember`) rely on session-level permissions and the event hook auto-approve. The first access by a subagent may briefly show a permission popup before auto-dismissing.
- The `permission.ask` plugin hook is defined in the OpenCode SDK but [not invoked](https://github.com/sst/opencode/blob/main/packages/opencode/src/permission/index.ts) in the source — this plugin works around it using `tool.execute.before` and event-based auto-approval.

## License

[MIT](LICENSE)
