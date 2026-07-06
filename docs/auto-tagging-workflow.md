# Auto-Tagging Workflow

This document describes the automated versioning and tagging system implemented for the WSLProxy project.

## Overview

The auto-tagging workflow automatically creates semantic version tags when code is merged to the main branch. It follows the MAJOR.MINOR.PATCH versioning scheme where:
- PATCH increments on every merge to main
- MINOR/MAJOR increments are manual (via workflow_dispatch)
- Tags follow the format: `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v1.0.16`)

## Workflows

### 1. Auto Tag on Merge to Main (`auto-tag-main.yml`)

This workflow runs when code is pushed to the main branch and automatically creates version tags.

**Triggers:**
- Push to main branch
- Manual dispatch via GitHub Actions UI

**Features:**
- Automatically calculates next version based on latest tag
- Creates annotated git tag with release message
- Generates GitHub Release
- Updates `system/app.json` with version information
- Sends Slack notification on new releases

**Manual Version Bumping:**
When triggered manually via workflow_dispatch, you can specify:
- `version_type`: "patch", "minor", or "major" 
- `custom_version`: Custom version string (overrides version_type)

### 2. Release Build Versioning (`release-build.yml`)

This workflow handles build versioning for release candidates on the release branch.

**Triggers:**
- Push to release branch
- Manual dispatch via GitHub Actions UI

**Features:**
- Creates build tags in format `vX.Y.Z-build.N`
- Maintains build counter per base version
- Updates `system/app.json` with detailed version information
- Sends Slack notification for new build versions

## Version File Structure

The version information is stored in `system/app.json`:

```json
{
  "name": "wslproxy",
  "version": {
    "version": "1.0.16",           // The full version string (without 'v' prefix)
    "build": "20260315021449",      // Build timestamp in YYYYMMDDHHMMSS format
    "deployment_timestamp": "2026-03-15T02:14:49Z"  // ISO timestamp of deployment
  }
}
```

## Usage

### For Main Branch Releases:
1. Merge code to main branch
2. The workflow will automatically create the next patch version tag (e.g., v1.0.16 → v1.0.17)
3. A GitHub release will be created with the new tag
4. The `system/app.json` file will be updated with the new version

### For Manual Version Bumping:
1. Go to Actions tab in GitHub
2. Select "Auto Tag on Merge to Main" workflow
3. Click "Run workflow"
4. Choose version type (patch, minor, or major) or specify custom version
5. The workflow will create the appropriate tag and release

### For Release Builds:
1. Push code to release branch
2. The workflow will automatically create build tags (e.g., v1.0.16-build.1)
3. The `system/app.json` file will be updated with detailed version information

## Implementation Details

The workflows use:
- `actions/checkout@v5` for repository access
- Git commands to determine and create versions
- `actions/create-release@v1` for GitHub release creation
- Slack webhook notifications for visibility
- Proper error handling and safety checks