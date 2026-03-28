# Update Release Specification

This document defines the minimum publishing rules that keep the built-in update check working correctly for `NatsX`.

## Source of Truth

- The application checks GitHub Releases from `https://api.github.com/repos/punk-one/NatsX/releases`
- Only the latest published release is considered
- `draft` and `prerelease` releases are ignored
- The newest public release should therefore always be the version you want the client to detect

## Tag and Version Rules

- Use semantic version tags such as `v1.0.1`
- Keep the release title aligned with the tag, for example `NatsX v1.0.1`
- Keep `wails.json`, `frontend/package.json`, and release assets on the same version

## Platform Asset Naming

The updater matches assets by platform name from `GOOS-GOARCH`.

- Windows AMD64: `windows-amd64`
- Linux AMD64: `linux-amd64`

Recommended asset names:

- `NatsX-<version>-windows-amd64.zip`
- `NatsX-<version>-windows-amd64-setup.exe` if an installer is provided
- `NatsX-<version>-linux-amd64.tar.gz`

## Asset Selection Rules

When multiple assets match the current platform, the app chooses in this order:

1. installer-like package: `.exe` / `.msi`
2. archive package: `.zip`
3. first matching fallback asset

For Linux releases, keep the primary downloadable package as `.tar.gz`.

## Recommended Release Assets

At minimum, every public release should upload:

- one Windows package
- one Linux package
- one per-package checksum file, for example `NatsX-1.0.1-windows-amd64.sha256.txt`
- one combined checksum file: `SHA256SUMS`

Optional assets:

- Windows installer package
- platform-specific notes or manifests

## Release Body

Recommended body content:

- short product summary
- highlights
- download section
- project links

The body can be edited freely because the updater does not parse markdown sections from the release notes.

## Operational Checklist

Before publishing:

- confirm the target tag does not already exist unexpectedly
- confirm the release is not marked as `draft`
- confirm the release is not marked as `prerelease`
- confirm asset names contain the exact platform token
- confirm at least one asset exists for each supported platform
- confirm `SHA256SUMS` matches the uploaded packages

## Current Implementation Reference

- Update checker: `internal/updatechecker/checker.go:15`
- Windows release packaging: `scripts/release-windows.ps1:1`
- Linux release packaging: `scripts/release-linux.sh:1`
