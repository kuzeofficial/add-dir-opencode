# GitHub Actions Setup

This repository uses GitHub Actions with **npm Trusted Publisher** to automatically publish the package when the version changes.

## Automated Release Process

The workflow triggers on push to `main` branch:

1. ✅ Checks if `package.json` version changed
2. ✅ If version changed: builds and publishes to npm
3. ✅ If version unchanged: skips workflow entirely

No manual intervention needed!

## How to Publish a New Version

Just update the version:

```bash
# Bump version
npm version patch  # or minor, or major

# Push to main branch
git push origin main
```

That's it! The workflow will:
- Detect version bump
- Build and publish to npm

If you push without changing the version, the workflow detects it and skips automatically.

## Example Workflow

```bash
# Bump version (creates a commit)
npm version patch

# Push to main
git push origin main

# GitHub Actions:
# - Detects package.json changed
# - Builds package
# - Publishes to npm
```

```bash
# Push without version bump
git push origin main

# GitHub Actions:
# - Detects package.json unchanged
# - Skips workflow (does nothing)
```

## Trusted Publisher Setup (One-Time Setup)

This repository uses npm's Trusted Publisher feature, which eliminates the need for an NPM_TOKEN secret.

### Step 1: Configure npm Trusted Publisher

1. Go to https://www.npmjs.com/package/opencode-add-dir/access
2. Click "Add a publisher"
3. Configure the publisher with these settings:
   - **GitHub Organization**: `kuzeofficial`
   - **Repository Name**: `add-dir-opencode`
   - **Workflow Name**: `.github/workflows/publish.yml`
   - **Environment Name**: leave empty (or specify if needed)

4. Click "Add publisher"

### Step 2: Verify Workflow Permissions

The workflow uses these permissions (configured in `.github/workflows/publish.yml`):
- `id-token: write` - Required for OIDC token
- `contents: write` - Required for checkout

These are already set in the workflow file - no additional configuration needed.

## Workflow Logic

The workflow has two jobs:

1. **check-and-publish**: Checks if package.json changed
   - Compares current commit with previous commit
   - Checks if package.json is in changed files
   - Outputs `should_publish` and `version`
   - Skips publish job if version unchanged

2. **publish**: Publishes to npm (only if version changed)
   - Runs only if `should_publish == true`
   - Installs dependencies
   - Builds package
   - Publishes using Trusted Publisher

## How Trusted Publisher Works

- No NPM_TOKEN secret needed
- GitHub Actions provides an OIDC token
- npm validates the token against your Trusted Publisher configuration
- The workflow can only publish from the configured repository
- Much more secure than using tokens

## Manual Publishing (Fallback)

If automated workflow fails, you can publish manually:

```bash
# Build
npm run build

# Publish
npm publish --access public
```

## Troubleshooting

### Workflow runs but doesn't publish
- Check if package.json actually changed in the commit
- The workflow skips automatically if version unchanged
- Check workflow logs at: Actions → Publish Package

### Workflow fails with "No publisher configured"
- Verify Trusted Publisher is configured at https://www.npmjs.com/package/opencode-add-dir/access
- Check that the repository name matches exactly
- Ensure the workflow name is correct: `.github/workflows/publish.yml`

### Workflow fails with "Missing id-token permission"
- Check that the workflow has `id-token: write` permission
- This is already configured in the workflow file

### Package not published
- Check the workflow run logs at: Actions → Publish Package
- Look for the "Check if package.json version changed" step
- Verify the Trusted Publisher configuration
