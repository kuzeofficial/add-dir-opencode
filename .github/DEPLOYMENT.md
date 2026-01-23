# GitHub Actions Setup

This repository uses GitHub Actions to automatically publish the package to npm when a release is created.

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
   - Publish to npm
   - Create a GitHub release with notes

## Required Secrets

Add these secrets in your repository settings (Settings → Secrets and variables → Actions):

- `NPM_TOKEN`: Your npm automation token
  - Create at https://www.npmjs.com/settings/<username>/tokens
  - Select "Automation" as the token type
  - Copy the token and add it as a repository secret

## Triggering the Workflow

The workflow is triggered when a release is **published** (not just created as a draft).

## Manual Publishing

If you prefer to publish manually:

```bash
# Build
npm run build

# Publish
npm publish --otp=<your-otp-code>
```
