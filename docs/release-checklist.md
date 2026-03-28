# NatsX Release Checklist

## Target Release

- Product: `NatsX`
- Version: `1.0.1`
- Release date: `2026-03-23`
- Author: `punk-one`
- License: `Apache License 2.0`

## Release Goal

This checklist is used to prepare a Windows desktop release for NatsX.

Current primary targets:

- Windows desktop executable
- Portable Windows `zip` package

## Required Artifacts

Before publishing, confirm these files exist and are up to date:

- `build/bin/NatsX.exe`
- `LICENSE`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `README.md`
- `README.zh.md`
- `wails.json`

## Supporting Docs

Release-related supporting documents:

- `docs/release-copy.md`
- `docs/release-github-bilingual.md`
- `docs/release-package-layout.md`
- `docs/release-publish-final.md`
- `docs/screenshot.png`
- `docs/screenshot-plan.md`

## Icon Assets

Current repository icon assets:

- `build/appicon.svg`
- `build/appicon.png`
- `build/windows/icon.ico`

Recommended future additions for wider platform coverage:

- macOS: `.icns`
- Linux: `512x512 png`

## Build Commands

### Frontend build

```powershell
cd frontend
npm run build
```

### Backend validation

```powershell
go test ./...
```

### Release script

```powershell
.\scripts\release-windows.ps1
.\scripts\release-windows.ps1 -SkipZip
```

### Release script outputs

Default outputs:

- `release/NatsX-1.0.1-windows-amd64/`
- `release/NatsX-1.0.1-windows-amd64.zip`
- `release/NatsX-1.0.1-windows-amd64.sha256.txt`
- `release/NatsX-1.0.1-windows-amd64-assets.md`
- `release/NatsX-1.0.1-windows-amd64-github-release.md`
- `release/NatsX-1.0.1-windows-amd64/docs/release-github-bilingual.md`
- `release/NatsX-1.0.1-windows-amd64/docs/release-publish-final.md`

Optional output with `-Nsis`:

- `release/NatsX-1.0.1-windows-amd64-setup.exe`

## Validation Checklist

Release only after all checks pass:

- `cd frontend && npm run build`
- `go test ./...`
- `.\scripts\release-windows.ps1 -SkipZip`
- Desktop binary launches successfully
- Chinese and English language switching works
- Selected language persists after restart
- Settings, connections, and logs reload from `database/natsx.db`
- Main workspaces render correctly:
  - Connections
  - Messages
  - Request / Reply
  - History
  - JetStream
- Connection create / edit / delete works
- Import / export works
- Credentials and TLS resource reuse works
- Publish / Subscribe works
- Request / Reply works
- Request replay and compare view works
- JetStream Stream / Consumer operations work
- Update check correctly detects the latest GitHub Release

## Suggested Release Package Layout

### Minimal zip package

```text
NatsX-1.0.1-windows-amd64.zip
- NatsX.exe
- LICENSE
- CHANGELOG.md
- RELEASE_NOTES.md
- README.md
- README.zh.md
- docs/release-checklist.md
- docs/release-copy.md
- docs/release-github-bilingual.md
- docs/release-package-layout.md
- docs/release-publish-final.md
- docs/screenshot.png
- release-manifest.txt
```

### Release attachments

Recommended GitHub Release attachments:

- `NatsX-1.0.1-windows-amd64.zip`
- `NatsX-1.0.1-windows-amd64.sha256.txt`

### Optional installer package

```text
NatsX-1.0.1-setup.exe
```

This package is optional and is not required for the `1.0.1` release.

## Final Release Check

Before publishing:

- Confirm version in `wails.json`
- Confirm changelog and release notes match the actual release
- Confirm icon assets are correct
- Confirm no visible text corruption remains in either language
- Confirm executable runs from `build/bin/NatsX.exe`
- Confirm `sha256` file matches the uploaded release assets

If all items are complete, the release is ready to publish.
