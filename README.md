# OpenCode Add-Dir Plugin

Add external directories to your OpenCode session context with automatic permission approval.

## Quick Start

1. Install the plugin:

```bash
cd ~/.config/opencode
npm install opencode-add-dir
```

2. Add `"opencode-add-dir"` to your `~/.config/opencode/opencode.jsonc` plugins array:

```jsonc
{
  "plugin": [
    "your-other-plugins",
    "opencode-add-dir"
  ]
}
```

3. Restart OpenCode

4. Use the command:

```bash
/add-dir /path/to/your/project
```

## Features

- **Zero Configuration**: Works immediately after installation
- **Auto Permission**: No permission prompts for directories you add
- **Smart Filtering**: Automatically skips node_modules, .git, binary files, etc.
- **Recursive Scanning**: Reads entire directory structures
- **File Limits**: 100KB per file, 500 files max (to prevent overwhelm)
- **Full Access**: Read and write to added directories

## How It Works

1. `/add-dir <path>` scans the directory and adds all files to context
2. Directory path is automatically registered for future access
3. Any operations on that directory skip permission prompts
4. Works recursively - all subdirectories are auto-approved

## Usage Examples

```bash
# Add a project directory
/add-dir ~/projects/my-app

# Add any external directory
/add-dir /path/to/external/code

# Now you can read/write without permission prompts
read ~/projects/my-app/src/index.js
edit ~/projects/my-app/package.json
```

## What Gets Filtered

### Automatically Skipped Directories
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

### Binary Files (Not Read)
Images, PDFs, Office docs, archives, media files, executables, compiled files, etc.

## Installation Details

The plugin's postinstall script automatically:
1. Finds your OpenCode config directory (`~/.config/opencode/`)
2. Creates the `/add-dir` command file
3. Installs it to `~/.config/opencode/command/add-dir.md`

### Troubleshooting

If the `/add-dir` command doesn't work after installation:

1. Verify the command file exists:
```bash
ls -la ~/.config/opencode/command/add-dir.md
```

2. If missing, create it manually:
```bash
mkdir -p ~/.config/opencode/command
cat > ~/.config/opencode/command/add-dir.md << 'EOF'
---
description: Add an external directory to the session context
---
Add the directory at path $ARGUMENTS to this session's context.
Use the add_dir tool to read all files from the specified directory.
EOF
```

## Development

For contributors and maintainers:

```bash
# Clone the repository
git clone https://github.com/kuzeofficial/add-dir-opencode.git
cd opencode-add-dir

# Install dependencies
bun install

# Build the TypeScript source
bun run build

# Test locally
npm link
cd ~/.config/opencode
npm link opencode-add-dir

# Publish new version
npm version patch  # or minor/major
npm publish
```

## Files

- `src/index.ts` - Main plugin with permission auto-approval
- `command/add-dir.md` - Command definition (auto-installed)
- `scripts/install.js` - Post-install script (auto-runs)
- `package.json` - NPM package configuration

## License

MIT
