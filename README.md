# NatsX

[English](README.md) | [简体中文](README.zh.md)

NatsX is a desktop client for `NATS / JetStream`, built with `Go + Wails + React + Ant Design`. It focuses on connection management, subscriptions, publishing, `Request / Reply` debugging, JetStream operations, and local persistence for desktop workflows.

- Version: `1.0.1`
- Author: `punk-one`
- Repository: [https://github.com/punk-one/NatsX](https://github.com/punk-one/NatsX)
- Releases: [https://github.com/punk-one/NatsX/releases](https://github.com/punk-one/NatsX/releases)
- License: `Apache License 2.0`

## Preview

![NatsX Screenshot](docs/screenshot.png)

## Overview

NatsX is designed as a practical desktop workbench for NATS users who want a local, visual workflow for connection management, live subscriptions, publishing, JetStream inspection, and replay-based debugging.

The current desktop UI is implemented with `Wails + React + Ant Design`, and the interaction design is inspired by [MQTTX](https://github.com/emqx/MQTTX) and the MQTTX documentation site at [mqttx.app/docs](https://mqttx.app/docs).

## Features

### Connection Management

- Create, edit, delete, group, import, and export connection profiles
- Support `No Auth`, `Username / Password`, `Token`, `TLS / mTLS`, `NKey`, and `Credentials`
- Reuse uploaded certificate, key, CA, and credentials files
- Restore saved connections and application settings on startup

### Messaging Workflow

- Subscribe to subjects and inspect live message traffic
- Publish messages with formatted payloads and headers
- View payloads as `JSON`, `Text`, `Hex`, `Base64`, `CBOR`, and `MsgPack`
- Keep recent publish history and quickly replay previous send operations

### Request / Reply

- Debug `Request / Reply` flows in a dedicated workspace
- Replay previous requests
- Compare original request, replayed request, and response results side by side
- Track timeout, latency, and correlation metadata

### JetStream

- Browse Streams and Consumers
- Create, edit, and remove Stream and Consumer definitions
- Fetch messages from Pull Consumers
- Execute `Ack`, `Nak`, and `Term` operations from the desktop UI

### Persistence

- Persist connections, settings, update state, and runtime messages in `SQLite`
- Store local data in `database/natsx.db`
- Persist language preference and desktop state between launches

## Tech Stack

- Backend: `Go` + `Wails`
- Frontend: `React` + `TypeScript` + `Ant Design`
- Messaging: `NATS Core` + `JetStream`
- Persistence: `SQLite` via `modernc.org/sqlite`

## Local Data

NatsX stores local state in the application directory:

- `database/natsx.db`
- `resources/credentials`
- `resources/tls`

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Desktop

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 dev
```

## Build

NatsX uses pure-Go SQLite support and does not require CGO for the default desktop build.

### Release Build

```powershell
.\scripts\release-windows.ps1 -SkipZip
```

### Wails Build

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m -ldflags "-H=windowsgui -extldflags=-Wl,--subsystem,windows"
```

Build output:

- `build/bin/NatsX.exe`

## Release Documents

- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `docs/release-checklist.md`
- `docs/release-copy.md`
- `docs/release-package-layout.md`

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
