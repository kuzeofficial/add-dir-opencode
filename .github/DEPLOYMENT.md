# GitHub Actions Setup

This repository uses GitHub Actions with **npm Trusted Publisher** to automatically publish the package when a version tag is pushed.

## Automated Release Process

The workflow triggers automatically when you push a version tag (e.g., `v1.0.3`) and:

1. ✅ Builds the package
2. ✅ Publishes to npm using Trusted Publisher
3. ✅ Creates a GitHub release with formatted notes

No manual intervention needed!

## How to Publish a New Version (Fully Automated)

Just run these commands:

```bash
# Update version (this creates a git tag)
npm version patch  # or minor, major

# Push the version and tag
git push origin main --tags
```

That's it! The GitHub Actions workflow will:
- Detect the new tag
- Build and publish to npm
- Automatically create a GitHub release

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
- `contents: read` - Required for checkout

These are already set in the workflow file - no additional configuration needed.

## How to Publish a New Version

1. Update the version in `package.json`:
   ```bash
   npm version patch  # or minor, major
   ```

2. Push the version bump and tag:
   ```bash
   git push origin main --tags
   ```

3. Go to GitHub Releases page and create a new release from the tag

4. The workflow will automatically:
   - Build the package
   - Publish to npm using Trusted Publisher (OIDC)
   - Create a GitHub release with notes

## How Trusted Publisher Works

- No NPM_TOKEN secret needed
- GitHub Actions provides an OIDC token
- npm validates the token against your Trusted Publisher configuration
- The workflow can only publish from the configured repository
- Much more secure than using tokens

## Manual Publishing (Fallback)

If the automated workflow fails, you can publish manually:

```bash
# Build
npm run build

# Publish
npm publish --provenance --access public
```

Then create a GitHub release manually on the website.


## Troubleshooting

### Workflow fails with "No publisher configured"
- Verify Trusted Publisher is configured at https://www.npmjs.com/package/opencode-add-dir/access
- Check that the repository name matches exactly
- Ensure the workflow name is correct: `.github/workflows/publish.yml`

### Workflow fails with "Missing id-token permission"
- Check that the workflow has `id-token: write` permission
- This is already configured in the workflow file

### Package not published but release is created
- Check the workflow run logs at: Actions → Publish Package
- Look for the "Publish to npm" step
- Verify the Trusted Publisher configuration

