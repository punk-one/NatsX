# NatsX v1.0.3

Hotfix Release for `NATS / JetStream`

`NatsX 1.0.3` is a desktop hotfix release focused on making structured upgrade metadata work reliably on Windows while preserving the cross-platform packaging introduced in `1.0.2`.

## Highlights

- Fixed `latest.json` loading in the Windows update checker
- Continues to publish both `windows-amd64` and `linux-amd64` packages
- Keeps `SHA256SUMS` and per-package checksum files
- Continues to store settings, connections, update state, and logs with pure-Go `SQLite`

## Downloads

- `NatsX-1.0.3-windows-amd64.zip`
- `NatsX-1.0.3-windows-amd64.sha256.txt`
- `NatsX-1.0.3-linux-amd64.tar.gz`
- `NatsX-1.0.3-linux-amd64.sha256.txt`
- `SHA256SUMS`
- `latest.json`

## Project

- Repository: `https://github.com/punk-one/NatsX`
- Homepage: `https://github.com/punk-one/NatsX`
- Release notes: see `RELEASE_NOTES.md` in the package
