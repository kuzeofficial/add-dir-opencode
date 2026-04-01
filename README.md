# opencode-add-dir

Add working directories to your [OpenCode](https://opencode.ai) session — inspired by Claude Code's [`/add-dir`](https://docs.anthropic.com/en/docs/claude-code/cli-usage#add-dir) command.

When you need an agent to read, edit, or search files outside the current project, this plugin grants access without permission popups.

## Quick Start

```bash
opencode plugin opencode-add-dir -g
```

Restart OpenCode. Done.

<details>
<summary>Alternative: setup CLI</summary>

```bash
npx opencode-add-dir-setup
```

</details>

<details>
<summary>Alternative: local development</summary>

```bash
git clone https://github.com/kuzeofficial/add-dir-opencode.git
cd add-dir-opencode
bun install && bun run deploy
```

Add the local path to both configs:

```jsonc
// ~/.config/opencode/opencode.json
{ "plugin": ["/path/to/add-dir-opencode"] }

// ~/.config/opencode/tui.json
{ "plugin": ["/path/to/add-dir-opencode"] }
```

</details>

## Commands

All commands are interactive TUI dialogs — type the command and select from autocomplete.

| Command | Dialog | Description |
|---------|--------|-------------|
| `/add-dir` | Text input + remember checkbox | Add a working directory. Toggle `[x] Remember` with tab to persist across sessions. |
| `/list-dir` | Alert | Shows all added directories. |
| `/remove-dir` | Select list + confirm | Pick a directory to remove, then confirm. |

## How It Works

The plugin has two parts: a **TUI plugin** for the interactive dialogs and a **server plugin** for silent permission handling.

### TUI Plugin

Handles all three slash commands via dialogs. Writes persisted directories to `~/.local/share/opencode/add-dir/directories.json` and grants session permissions via the SDK.

### Server Plugin

Runs in the background — no commands, only hooks:

| Hook | What it does |
|------|-------------|
| `config` | Injects `external_directory: "allow"` permission rules for persisted dirs at startup |
| `tool.execute.before` | Auto-grants permissions when subagents access added directories |
| `event` | Auto-approves any remaining permission popups for added directories |
| `system.transform` | Injects `AGENTS.md` / `CLAUDE.md` content from added directories into the system prompt |

### Context Injection

If an added directory contains `AGENTS.md`, `CLAUDE.md`, or `.agents/AGENTS.md`, the content is automatically injected into the system prompt.

## Development

```bash
bun install
bun test           # Run tests
bun run typecheck  # Type check
bun run build      # Build npm package
bun run deploy     # Build server + TUI locally
```

### Project Structure

```
src/
├── index.ts          # Server plugin entry
├── plugin.ts         # Server hooks (permissions, context injection)
├── tui-plugin.tsx    # TUI plugin (dialogs for add/list/remove)
├── state.ts          # Persistence, path utils, tui.json auto-config
├── validate.ts       # Directory validation
├── permissions.ts    # Session grants + auto-approve
├── context.ts        # AGENTS.md injection
└── types.ts          # Shared type definitions
```

## Limitations

- Directories added without "Remember" rely on session-level permissions. The first access by a subagent may briefly show a permission popup before auto-dismissing.
- The `permission.ask` plugin hook is defined in the OpenCode SDK but [not invoked](https://github.com/sst/opencode/blob/main/packages/opencode/src/permission/index.ts) in the source — this plugin works around it using `tool.execute.before` and event-based auto-approval.

## License

[MIT](LICENSE)
