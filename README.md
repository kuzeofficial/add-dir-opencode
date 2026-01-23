# OpenCode Add-Dir Plugin

A plugin for OpenCode that adds the `/add-dir` command to include external directories in your session context.

## Installation

```bash
cd ~/.config/opencode/plugins/add-dir
bun install
```

## Features

- Add external directories to session context with `/add-dir <path>`
- Smart filtering of binary files and common build directories
- Recursive directory scanning
- Configurable limits (100KB per file, 500 files max)
- Read and write access to added directories

## Configuration

The plugin automatically installs its command file to `~/.config/opencode/command/add-dir.md` during installation.

Ensure your `~/.config/opencode/opencode.jsonc` includes:

```jsonc
"plugin": [
  "./plugins/add-dir"
]
```

## Usage

```bash
/add-dir /path/to/your/project
```

## Filtering Rules

### Ignored Directories
- `node_modules`
- `.git`
- `dist`, `build`
- `.next`
- `__pycache__`
- Virtual environments (`.venv`, `venv`, `env`)
- `.env`, `.env.*`
- `coverage`
- `.nuxt`, `.output`
- `tmp`, `temp`, `.turbo`

### Binary Files
Images, PDFs, Office docs, archives, media files, executables, compiled files, etc.

## Development

```bash
cd ~/.config/opencode/plugins/add-dir

# Install dependencies
bun install

# Build the plugin
bun run build

# The build output goes to dist/
```

## Files

- `src/index.ts` - Main plugin implementation
- `command/add-dir.md` - Command definition (auto-installed)
- `scripts/install.js` - Post-install script (auto-runs)
- `package.json` - Package configuration

## License

MIT
