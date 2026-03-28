# NatsX

[English](README.md) | [简体中文](README.zh.md)

NatsX 是一个面向 `NATS / JetStream` 的桌面客户端，基于 `Go + Wails + React + Ant Design` 构建，聚焦连接管理、订阅、消息发送、`Request / Reply` 调试、JetStream 运维与本地持久化工作流。

- 版本：`1.0.1`
- 作者：`punk-one`
- 仓库地址：[https://github.com/punk-one/NatsX](https://github.com/punk-one/NatsX)
- Releases：[https://github.com/punk-one/NatsX/releases](https://github.com/punk-one/NatsX/releases)
- 许可证：`Apache License 2.0`

## 预览

![NatsX Screenshot](docs/screenshot.png)

## 项目说明

NatsX 旨在为 NATS 用户提供一个可视化、本地化的桌面工作台，用于管理连接、实时订阅、发送消息、排查 `Request / Reply`、查看 JetStream 资源以及保存常用配置。

当前桌面界面基于 `Wails + React + Ant Design` 实现，交互与布局设计参考了 [MQTTX](https://github.com/emqx/MQTTX) 及其官方文档站点 [mqttx.app/docs](https://mqttx.app/docs)。

## 功能特性

### 连接管理

- 支持连接的新建、编辑、删除、分组、导入与导出
- 支持 `无认证`、`用户名 / 密码`、`Token`、`TLS / mTLS`、`NKey` 与 `Credentials`
- 支持复用证书、私钥、CA 与凭证文件
- 支持自动恢复已保存的连接与应用设置

### 消息工作流

- 订阅 Subject 并实时查看消息流
- 支持带 Headers 的消息发送与载荷格式化
- 支持 `JSON`、`Text`、`Hex`、`Base64`、`CBOR`、`MsgPack` 等载荷视图
- 保存最近发送记录，便于快速切换与重放

### Request / Reply

- 提供独立的 `Request / Reply` 调试工作区
- 支持历史请求重放
- 支持原请求、重放请求、响应结果并排对比
- 支持查看超时、耗时与关联信息

### JetStream

- 浏览 Streams 与 Consumers
- 新建、编辑、删除 Stream / Consumer 配置
- 从 Pull Consumer 手动抓取消息
- 在界面中执行 `Ack`、`Nak`、`Term`

### 本地持久化

- 将连接、设置、更新状态与运行时消息持久化到 `SQLite`
- 本地数据库文件为 `database/natsx.db`
- 记住界面语言和部分桌面状态

## 技术栈

- 后端：`Go` + `Wails`
- 前端：`React` + `TypeScript` + `Ant Design`
- 协议能力：`NATS Core` + `JetStream`
- 持久化：`modernc.org/sqlite`

## 本地数据目录

NatsX 默认将本地状态保存在应用目录下：

- `database/natsx.db`
- `resources/credentials`
- `resources/tls`

## 开发

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

### 桌面联调

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 dev
```

## 构建

NatsX 当前使用纯 Go 的 SQLite 驱动，默认构建不依赖 CGO。

### 发布构建

```powershell
.\scripts\release-windows.ps1 -SkipZip
```

### Wails 构建

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m -ldflags "-H=windowsgui -extldflags=-Wl,--subsystem,windows"
```

构建产物：

- `build/bin/NatsX.exe`

## 发布文档

- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `docs/release-checklist.md`
- `docs/release-copy.md`
- `docs/release-package-layout.md`

## 许可证

本项目基于 Apache License 2.0 发布，详见 [LICENSE](LICENSE)。
