# WSLProxy Versioning and Tagging System

## Overview

This project implements a comprehensive auto-versioning and tagging system using GitHub Actions workflows to automate release management for the WSLProxy project.

## Implemented Workflows

### 1. Auto Tag on Merge to Main (`auto-tag-main.yml`)

This workflow automatically creates semantic version tags when code is merged to the main branch:

- **Trigger**: Push to main branch or manual dispatch
- **Versioning Scheme**: MAJOR.MINOR.PATCH (e.g., v1.0.16)
- **Behavior**:
  - Automatically increments PATCH version on every merge to main
  - Supports manual MINOR and MAJOR version bumps via workflow_dispatch
  - Creates annotated git tags with release messages
  - Generates GitHub Releases
  - Updates `system/app.json` with version information
  - Sends Slack notifications

### 2. Release Build Versioning (`release-build.yml`)

This workflow handles build versioning for release candidates on the release branch:

- **Trigger**: Push to release branch or manual dispatch  
- **Versioning Scheme**: Base version + build counter (e.g., v1.0.16-build.1)
- **Behavior**:
  - Maintains build counter per base version
  - Creates build tags in format `vX.Y.Z-build.N`
  - Updates `system/app.json` with detailed version information
  - Sends Slack notifications

## Version File Structure

Version information is stored in `system/app.json`:

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
2. Workflow automatically creates next patch version tag (e.g., v1.0.16 → v1.0.17)
3. GitHub release created with new tag
4. `system/app.json` updated with new version

### For Manual Version Bumping:
1. Go to Actions tab in GitHub
2. Select "Auto Tag on Merge to Main" workflow  
3. Click "Run workflow"
4. Choose version type (patch, minor, or major) or specify custom version
5. Workflow creates appropriate tag and release

### For Release Builds:
1. Push code to release branch
2. Workflow automatically creates build tags (e.g., v1.0.16-build.1)
3. `system/app.json` updated with detailed version information

## Implementation Details

The workflows use:
- `actions/checkout@v5` for repository access
- Git commands to determine and create versions  
- `actions/create-release@v1` for GitHub release creation
- Slack webhook notifications for visibility
- Proper error handling and safety checks