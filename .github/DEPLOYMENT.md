# GitHub Actions Setup

This repository uses GitHub Actions with **npm Trusted Publisher** to automatically publish the package when you push to the main branch.

## Automated Release Process

The workflow triggers automatically when you push to `main` branch and:

1. ✅ Checks if a tag for the current version exists
2. ✅ Creates a new git tag (if it doesn't exist)
3. ✅ Builds the package
4. ✅ Publishes to npm using Trusted Publisher
5. ✅ Creates a GitHub release with formatted notes

No manual intervention needed!

## How to Publish a New Version (Fully Automated)

Just run these commands:

```bash
# Update version in package.json manually or use npm version
npm version patch  # or minor, major

# Push to main branch
git push origin main
```

That's it! The GitHub Actions workflow will:
- Detect version bump
- Create tag automatically
- Build and publish to npm
- Automatically create a GitHub release

## Example Workflow

```bash
# Bump version (creates a commit but NOT a tag)
npm version patch

# Push to main
git push origin main

# GitHub Actions automatically:
# - Creates tag v1.x.x
# - Publishes to npm
# - Creates GitHub release
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
- `contents: write` - Required to create GitHub releases and tags

These are already set in the workflow file - no additional configuration needed.

## Workflow Triggers

The workflow is triggered automatically when you push to the `main` branch:
- Checks if a tag for the current version already exists
- Only publishes if the tag doesn't exist (prevents duplicate publishing)
- Uses the version from `package.json`

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

### Workflow runs but doesn't publish
- Check if the tag already exists: `git tag | grep v`
- Delete the existing tag if needed: `git tag -d v1.x.x && git push origin :refs/tags/v1.x.x`
- Check workflow logs to see if "Tag already exists, skipping" message appears

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
