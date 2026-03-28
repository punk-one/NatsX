# Changelog

All notable changes to `NatsX` will be documented in this file.

## [1.0.2] - 2026-03-28

### Added

- Cross-platform release packaging for `Windows` and `Linux`
- Stable release metadata asset `latest.json` for future updater compatibility
- Combined release checksum file `SHA256SUMS`
- Linux release automation via `scripts/release-linux.sh`

### Changed

- Update checking now prefers structured release metadata when `latest.json` is attached to the latest GitHub Release
- Release tooling now keeps release metadata aligned across packaged assets and GitHub uploads
- Release collateral updated for the `1.0.2` desktop release

### Notes

- `v1.0.2` is the first `NatsX` release published with both `windows-amd64` and `linux-amd64` artifacts
- Manual upgrade remains supported through GitHub Releases and direct package download

## [1.0.1] - 2026-03-23

### Added

- Windows desktop client built with `Go + Wails + React + Ant Design`
- Connection create, edit, delete, grouping, import, and export workflows
- Authentication support for `No Auth`, `Username / Password`, `Token`, `TLS / mTLS`, `NKey`, and `Credentials`
- Managed local resource storage for credentials and TLS-related files
- Publish, subscribe, reply, republish, and payload inspection workflows
- Headers editing, payload formatting, and multiple payload views
- `Request / Reply` replay and side-by-side comparison tools
- Viewer, payload inspector, message history, and runtime log inspection
- JetStream Stream / Consumer management, pull fetch, and `Ack / Nak / Term`
- Built-in update checking with GitHub Release awareness and manual upgrade flow
- Chinese and English UI support with persisted language selection

### Changed

- Replaced legacy JSON persistence with pure-Go `SQLite`
- Unified settings, connections, update state, and logs under `database/natsx.db`
- Standardized project branding, repository links, and release metadata for `NatsX`
- Standardized the recommended Windows release format as the portable `zip` package

### Packaging

- Portable Windows release package now includes:
  - `README.md`
  - `README.zh.md`
  - `RELEASE_NOTES.md`
  - release support documents and preview screenshot
- Release tooling generates checksum files and GitHub release helper documents

### Notes

- Protocol capabilities and operational workflows in `1.0.1` are focused on `NATS / JetStream`
- `NSIS installer` packaging remains optional and is not required for this release
