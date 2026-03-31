# Contributing

## Setup

```bash
git clone https://github.com/kuzeofficial/add-dir-opencode.git
cd add-dir-opencode
bun install
```

## Development

```bash
bun test           # Run tests
bun run typecheck  # Type check
bun run build      # Build npm package
bun run deploy     # Bundle to ~/.config/opencode/plugins/
```

## Project Structure

```
src/
├── index.ts        # Entry point (default export)
├── plugin.ts       # Hooks + tools
├── state.ts        # Persistence
├── validate.ts     # Directory validation
├── permissions.ts  # Session grants + auto-approve
└── context.ts      # AGENTS.md injection
```

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning. **Do not manually edit the version in `package.json`.**

| Prefix | Bump | Example |
|---|---|---|
| `fix:` | patch (1.0.1 → 1.0.2) | `fix: handle trailing slash` |
| `feat:` | minor (1.0.2 → 1.1.0) | `feat: add --force flag` |
| `feat!:` or `BREAKING CHANGE:` | major (1.1.0 → 2.0.0) | `feat!: rename add_dir to adddir` |
| `chore:`, `ci:`, `docs:` | no release | `ci: update node version` |

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Write tests for any new functionality
3. Make sure `bun test` and `bun run typecheck` pass
4. Use conventional commit messages
5. Open a PR targeting `main` — CI runs automatically

## Release Flow

Releases are fully automated:

1. PR merged to `main`
2. semantic-release analyzes commits and determines version bump
3. `package.json` and `CHANGELOG.md` are updated automatically
4. GitHub release is created with generated notes
5. npm package is published via trusted publishers (OIDC)
