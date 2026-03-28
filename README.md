# NatsX

[English](README.md) | [绠€浣撲腑鏂嘳(README.zh.md)

NatsX is a desktop client for `NATS / JetStream`, built with `Go + Wails + React + Ant Design`. It focuses on connection management, subscriptions, publishing, `Request / Reply` debugging, JetStream workflows, and reliable local persistence.

- Version: `1.0.3`
- Author: `punk-one`
- Repository: [https://github.com/punk-one/NatsX](https://github.com/punk-one/NatsX)
- Releases: [https://github.com/punk-one/NatsX/releases](https://github.com/punk-one/NatsX/releases)
- License: `Apache License 2.0`

## Preview

![NatsX Screenshot](docs/screenshot.png)

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

- Send request messages with timeout control
- Compare original request, replay request, and response side by side
- Track request IDs, durations, and correlated messages

### JetStream

- Browse Streams and Consumers
- Create, update, and delete Stream / Consumer configurations
- Fetch messages from pull consumers
- Perform `Ack`, `Nak`, and `Term` actions in the desktop UI

### Persistence and Release Workflow

- Store settings, connections, update state, and logs in `database/natsx.db`
- Save uploaded credentials and TLS-related resources under the local app directory
- Check GitHub Releases for updates and support manual upgrade
- Publish portable packages for both `windows-amd64` and `linux-amd64`

## Build

### Windows

```powershell
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m
```

### Linux

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m -platform linux/amd64 -nopackage -tags webkit2_41 -o NatsX
```

## Release Assets

For `v1.0.3`, the GitHub Release includes:

- `NatsX-1.0.3-windows-amd64.zip`
- `NatsX-1.0.3-windows-amd64.sha256.txt`
- `NatsX-1.0.3-linux-amd64.tar.gz`
- `NatsX-1.0.3-linux-amd64.sha256.txt`
- `SHA256SUMS`
- `latest.json`

## License

Licensed under the `Apache License 2.0`. See `LICENSE` for details.

