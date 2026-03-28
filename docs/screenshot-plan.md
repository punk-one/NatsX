# NatsX Screenshot Plan

## Goal

This document defines the recommended screenshots for the `1.0.2` release.

The aim is to produce a consistent set of images for:

- repository README
- release notes
- release announcement
- installer or download page

## Capture Environment

Recommended capture environment:

- Resolution: `1600x1000` or `1440x900`
- Theme: current default desktop theme
- Window state: normal maximized window, not fullscreen
- Language: simplified Chinese for product screenshots
- Data: realistic but safe demo data only

## Safety Rules

Before capturing screenshots:

- Do not expose real passwords, tokens, or private URLs
- Prefer masked or demo connection profiles
- Use demo subjects such as:
  - `orders.created`
  - `orders.updated`
  - `rpc.health.check`
  - `demo.stream.>`
- Use demo payloads only

## Suggested Demo Connections

Prepare 2 to 3 demo connections:

1. `Local NATS`
   - URL: `nats://127.0.0.1:4222`
   - Auth: `none`

2. `Demo Remote`
   - URL: `nats://demo.example.com:4222`
   - Auth: `user/password`
   - Password should be masked or omitted in screenshots

3. `JetStream Cluster`
   - URL: `nats://jetstream.example.com:4222`
   - Auth: `token`
   - Token should never appear in screenshots

## Screenshot List

### 1. App Shell

Purpose:

- show titlebar
- show left rail
- show connection sidebar

Recommended content:

- one active connection
- one selected workspace
- 3 to 5 visible connections in sidebar

Filename:

- `01-shell.png`

### 2. Messages Workspace

Purpose:

- show subscribe list
- show live message list
- show publish composer

Recommended content:

- selected subject filter
- several inbound and outbound messages
- one structured JSON payload in viewer

Filename:

- `02-messages.png`

### 3. Request / Reply Workspace

Purpose:

- show request editor
- show replay compare view

Recommended content:

- original request
- replay request
- response diff

Filename:

- `03-request-reply.png`

### 4. Message History

Purpose:

- show searchable history table
- show detail inspector

Recommended content:

- filters visible
- one selected row
- headers and payload visible in detail pane

Filename:

- `04-history.png`

### 5. JetStream Workspace

Purpose:

- show Streams
- show Consumers
- show Inspector

Recommended content:

- 2 to 3 streams
- at least 1 pull consumer
- inspector with fetch controls

Filename:

- `05-jetstream.png`

### 6. Connection Editor Dialog

Purpose:

- show connection creation/editing experience

Recommended content:

- preset selector
- auth mode selector
- main fields filled with demo values

Filename:

- `06-connection-editor.png`

### 7. Import / Export Dialog

Purpose:

- show release-ready management workflow

Recommended content:

- masked export preview
- import/export controls visible

Filename:

- `07-import-export.png`

## Optional Screenshots

If you want more release assets, also capture:

- `08-republish-dialog.png`
- `09-reply-dialog.png`
- `10-jetstream-fetch-result.png`

## Capture Sequence

Recommended order:

1. open app shell
2. capture messages workspace
3. capture request workspace
4. capture history workspace
5. capture JetStream workspace
6. capture dialogs last

This keeps data state stable and reduces retakes.

## Post-Processing

After capture:

- crop to remove unnecessary desktop background
- keep consistent window margins
- avoid excessive image compression
- prefer PNG for UI screenshots
- rename files using the ordered names above

## Recommended Output Folder

Store final screenshots in:

- `docs/screenshots/`

Suggested final set:

```text
docs/screenshots/
鈹溾攢 01-shell.png
鈹溾攢 02-messages.png
鈹溾攢 03-request-reply.png
鈹溾攢 04-history.png
鈹溾攢 05-jetstream.png
鈹溾攢 06-connection-editor.png
鈹斺攢 07-import-export.png
```

## Final Check

Before using screenshots publicly, confirm:

- all text is readable
- no sensitive data is visible
- selected states are obvious
- the UI matches the current `1.0.2` build

