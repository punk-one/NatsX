import type {
  ConnectionInput,
  AppSettings,
  ConnectionProfile,
  ExportConnectionsFileResponse,
  ExportConnectionsRequest,
  ConsumerDeleteRequest,
  ConsumerFetchRequest,
  ConsumerFetchResponse,
  ExportConnectionsResponse,
  ConsumerInfo,
  ConsumerUpsertRequest,
  ImportConnectionsFromFileRequest,
  MessageActionRequest,
  ManagedResourceFile,
  MessageRecord,
  LogRetentionSettings,
  ImportConnectionsRequest,
  ImportConnectionsResponse,
  PublishRequest,
  RepublishMessageRequest,
  RepublishMessageResponse,
  ReplyRequest,
  RequestMessageRequest,
  RequestMessageResponse,
  Snapshot,
  StreamDeleteRequest,
  StreamInfo,
  StreamUpsertRequest,
  SubscribeRequest,
  SubscriptionInfo,
  UpdateDownloadResult,
  SetSubscriptionStateRequest,
  UpdateInfo,
  UpdateState,
  UpdateSubscriptionRequest,
  WindowState,
} from '../types'
import { matchNatsSubject } from '../utils/nats'
import { base64ToBytes, bytesToBase64 } from '../utils/payload'

type MethodName =
  | 'GetSnapshot'
  | 'SaveConnection'
  | 'DeleteConnection'
  | 'ExportConnections'
  | 'ExportConnectionsToFile'
  | 'ImportConnections'
  | 'ImportConnectionsFromFile'
  | 'Connect'
  | 'Disconnect'
  | 'Publish'
  | 'RepublishMessage'
  | 'Request'
  | 'Reply'
  | 'AckMessage'
  | 'NakMessage'
  | 'TermMessage'
  | 'UpsertStream'
  | 'DeleteStream'
  | 'UpsertConsumer'
  | 'DeleteConsumer'
  | 'FetchConsumerMessages'
  | 'Subscribe'
  | 'UpdateSubscription'
  | 'SetSubscriptionState'
  | 'Unsubscribe'
  | 'ListStreams'
  | 'ListConsumers'
  | 'GetWindowState'
  | 'GetAppSettings'
  | 'SaveAppSettings'
  | 'GetLogRetentionSettings'
  | 'SaveLogRetentionSettings'
  | 'CheckForUpdates'
  | 'StartManualUpgrade'
  | 'DownloadUpdatePackage'
  | 'OpenDownloadedUpdate'
  | 'GetUpdateState'
  | 'RevealDownloadedUpdate'
  | 'ImportCredentialsFile'
  | 'ListCredentialsFiles'
  | 'ImportTLSCertFile'
  | 'ListTLSCertFiles'
  | 'ImportTLSKeyFile'
  | 'ListTLSKeyFiles'
  | 'ImportTLSCAFile'
  | 'ListTLSCAFiles'
  | 'WindowMinimise'
  | 'WindowToggleMaximise'
  | 'WindowClose'

const requestIdHeader = 'X-NatsX-Request-Id'
const createTimestamp = () => new Date().toISOString()
const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`
const mockEncoder = new TextEncoder()
const mockStrictDecoder = new TextDecoder('utf-8', { fatal: true })
const mockWindowState: WindowState = {
  maximised: false,
  minimised: false,
  fullscreen: false,
  normal: true,
}
const defaultLogRetentionSettings: LogRetentionSettings = {
  maxTotalBytes: 100 * 1024 * 1024,
  maxEntries: 1000,
}
const defaultAppSettings: AppSettings = {
  autoCheckUpdate: true,
  autoResubscribe: true,
  multiSubjectSubscribe: true,
  maxReconnectTimes: 10,
  maxPayloadSize: 512,
  themeMode: 'light',
  language: 'zh-CN',
  logRetention: { ...defaultLogRetentionSettings },
}
const mockUpdateInfo: UpdateInfo = {
  currentVersion: '1.0.3',
  latestVersion: '1.0.4',
  releaseFound: true,
  hasUpdate: true,
  hasPlatformAsset: true,
  platform: 'windows-amd64',
  releaseUrl: 'https://github.com/punk-one/NatsX/releases/tag/v1.0.4',
  downloadUrl: 'https://github.com/punk-one/NatsX/releases/download/v1.0.4/NatsX-1.0.4-windows-amd64.zip',
  assetName: 'NatsX-1.0.4-windows-amd64.zip',
  publishedAt: createTimestamp(),
  releaseNotes: 'Mock release notes for update preview.',
}
let mockDownloadedUpdate: UpdateDownloadResult | undefined
let mockCredentialsFiles: ManagedResourceFile[] = [
  {
    name: 'demo-user.creds',
    path: 'C:\\Program Files\\NatsX\\resources\\credentials\\demo-user.creds',
    relativePath: 'demo-user.creds',
    size: 2048,
    updatedAt: createTimestamp(),
    reused: false,
  },
]
let mockTLSCertFiles: ManagedResourceFile[] = []
let mockTLSKeyFiles: ManagedResourceFile[] = []
let mockTLSCAFiles: ManagedResourceFile[] = []

const mockState: {
  connections: ConnectionProfile[]
  subscriptions: SubscriptionInfo[]
  messages: MessageRecord[]
  streams: Record<string, StreamInfo[]>
  consumers: Record<string, ConsumerInfo[]>
  appSettings: AppSettings
} = {
  connections: [
    {
      id: 'local',
      name: 'Local NATS',
      url: 'nats://127.0.0.1:4222',
      authMode: 'none',
      description: '本地开发环境',
      connected: false,
      updatedAt: createTimestamp(),
    },
    {
      id: 'demo',
      name: 'JetStream Demo',
      url: 'nats://demo.nats.io:4222',
      authMode: 'none',
      description: '内置演示与预览环境',
      connected: false,
      updatedAt: createTimestamp(),
    },
  ],
  subscriptions: [],
  messages: [],
  appSettings: { ...defaultAppSettings, logRetention: { ...defaultLogRetentionSettings } },
  streams: {
    local: [
      {
        name: 'ORDERS',
        subjects: ['orders.created', 'orders.updated'],
        messages: 1248,
        bytes: 94012,
        consumers: 2,
        storage: 'FileStorage',
        replicas: 1,
      },
      {
        name: 'AUDIT',
        subjects: ['audit.>'],
        messages: 892,
        bytes: 67540,
        consumers: 1,
        storage: 'FileStorage',
        replicas: 1,
      },
    ],
    demo: [
      {
        name: 'METRICS',
        subjects: ['metrics.api', 'metrics.worker'],
        messages: 322,
        bytes: 22102,
        consumers: 1,
        storage: 'MemoryStorage',
        replicas: 1,
      },
    ],
  },
  consumers: {
    local__ORDERS: [
      {
        name: 'orders-dashboard',
        streamName: 'ORDERS',
        ackPolicy: 'AckExplicitPolicy',
        deliverPolicy: 'DeliverLastPolicy',
        filterSubject: 'orders.created',
        isPullMode: true,
        numPending: 12,
        numWaiting: 0,
        numAckPending: 1,
      },
      {
        name: 'orders-live-push',
        streamName: 'ORDERS',
        ackPolicy: 'AckAllPolicy',
        deliverPolicy: 'DeliverAllPolicy',
        filterSubject: 'orders.updated',
        deliverSubject: '_INBOX.orders.live',
        isPullMode: false,
        numPending: 0,
        numWaiting: 0,
        numAckPending: 0,
      },
    ],
    local__AUDIT: [
      {
        name: 'audit-reader',
        streamName: 'AUDIT',
        ackPolicy: 'AckExplicitPolicy',
        deliverPolicy: 'DeliverNewPolicy',
        filterSubject: 'audit.>',
        isPullMode: true,
        numPending: 5,
        numWaiting: 2,
        numAckPending: 0,
      },
    ],
    demo__METRICS: [
      {
        name: 'metrics-live',
        streamName: 'METRICS',
        ackPolicy: 'AckNonePolicy',
        deliverPolicy: 'DeliverLastPerSubjectPolicy',
        filterSubject: 'metrics.api',
        deliverSubject: '_INBOX.metrics.live',
        isPullMode: false,
        numPending: 0,
        numWaiting: 1,
        numAckPending: 0,
      },
    ],
  },
}

function consumerKey(connectionId: string, streamName: string) {
  return `${connectionId}__${streamName}`
}

function buildConnectionPayload(connection: ConnectionProfile) {
  return {
    id: connection.id,
    name: connection.name,
    url: connection.url,
    authMode: connection.authMode ?? 'none',
    username: connection.username,
    password: connection.password,
    token: connection.token,
    certFile: connection.certFile,
    keyFile: connection.keyFile,
    caFile: connection.caFile,
    nkeyOrSeed: connection.nkeyOrSeed,
    credsFile: connection.credsFile,
    group: connection.group,
    description: connection.description,
  } satisfies ConnectionInput
}

function parseImportedConnections(content: string): ConnectionInput[] {
  const parsed = JSON.parse(content) as ConnectionInput[] | ConnectionProfile[] | { connections?: ConnectionInput[] }
  if (Array.isArray(parsed)) {
    return parsed.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      authMode: item.authMode,
      username: item.username,
      password: item.password,
      token: item.token,
      certFile: item.certFile,
      keyFile: item.keyFile,
      caFile: item.caFile,
      nkeyOrSeed: item.nkeyOrSeed,
      credsFile: item.credsFile,
      group: item.group,
      description: item.description,
    }))
  }
  return parsed.connections ?? []
}

function estimateMessageBytes(message: MessageRecord) {
  let total = message.size || message.payload.length
  total +=
    message.id.length +
    message.connectionId.length +
    message.subject.length +
    (message.reply?.length ?? 0) +
    (message.payloadBase64?.length ?? 0) +
    (message.payloadEncoding?.length ?? 0) +
    (message.correlationId?.length ?? 0) +
    (message.relatedMessageId?.length ?? 0) +
    (message.replaySourceMessageId?.length ?? 0) +
    (message.errorMessage?.length ?? 0)

  Object.entries(message.headers ?? {}).forEach(([key, values]) => {
    total += key.length
    values.forEach((value) => {
      total += value.length
    })
  })

  return total
}

function trimMockMessages() {
  const maxEntries = Math.max(1, mockState.appSettings.logRetention.maxEntries || defaultLogRetentionSettings.maxEntries)
  const maxTotalBytes = Math.max(
    1,
    mockState.appSettings.logRetention.maxTotalBytes || defaultLogRetentionSettings.maxTotalBytes,
  )

  while (mockState.messages.length > maxEntries) {
    mockState.messages.pop()
  }

  let totalBytes = mockState.messages.reduce((sum, item) => sum + estimateMessageBytes(item), 0)
  while (mockState.messages.length > 0 && totalBytes > maxTotalBytes) {
    const removed = mockState.messages.pop()
    if (!removed) {
      break
    }
    totalBytes -= estimateMessageBytes(removed)
  }
}

function appendMessage(message: MessageRecord) {
  mockState.messages.unshift(message)
  trimMockMessages()
}

function updateMessage(messageId: string, updater: (message: MessageRecord) => MessageRecord) {
  mockState.messages = mockState.messages.map((item) => (item.id === messageId ? updater(item) : item))
}

function buildHeaders(headers?: Record<string, string>): Record<string, string[]> | undefined {
  if (!headers || Object.keys(headers).length === 0) {
    return undefined
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, [value]]))
}

function cloneHeaders(headers?: Record<string, string>) {
  return headers ? { ...headers } : {}
}

function ensureRequestId(headers?: Record<string, string>, explicitRequestId?: string) {
  const nextHeaders = cloneHeaders(headers)
  const matchedHeaderKey = Object.keys(nextHeaders).find((key) => key.toLowerCase() === requestIdHeader.toLowerCase())
  const requestId = explicitRequestId?.trim() || (matchedHeaderKey ? nextHeaders[matchedHeaderKey].trim() : '') || createId('req')
  if (matchedHeaderKey && matchedHeaderKey !== requestIdHeader) {
    delete nextHeaders[matchedHeaderKey]
  }
  nextHeaders[requestIdHeader] = requestId
  return { headers: nextHeaders, requestId }
}

function resolvePayloadBytes(payload: string, payloadBase64?: string) {
  if (payloadBase64?.trim()) {
    return base64ToBytes(payloadBase64.trim())
  }
  return mockEncoder.encode(payload)
}

function payloadDisplayValue(bytes: Uint8Array) {
  try {
    return mockStrictDecoder.decode(bytes)
  } catch {
    return bytesToBase64(bytes)
  }
}

function payloadDisplayEncoding(bytes: Uint8Array): NonNullable<MessageRecord['payloadEncoding']> {
  try {
    mockStrictDecoder.decode(bytes)
    return 'text'
  } catch {
    return 'base64'
  }
}

function normalizePayloadEncoding(payloadEncoding?: string, payloadBase64?: string) {
  const nextEncoding = payloadEncoding?.trim().toLowerCase()
  if (nextEncoding) {
    return nextEncoding
  }
  return payloadBase64?.trim() ? 'base64' : 'text'
}

function updateAckState(messageId: string, nextState: MessageRecord['ackState']) {
  const messageRecord = mockState.messages.find((item) => item.id === messageId)
  if (messageRecord?.jetStream && messageRecord.connectionId && messageRecord.jetStreamStream && messageRecord.jetStreamConsumer) {
    const key = consumerKey(messageRecord.connectionId, messageRecord.jetStreamStream)
    mockState.consumers[key] = (mockState.consumers[key] ?? []).map((item) =>
      item.name === messageRecord.jetStreamConsumer
        ? { ...item, numAckPending: Math.max(0, item.numAckPending - 1) }
        : item,
    )
  }

  mockState.messages = mockState.messages.map((item) =>
    item.id === messageId ? { ...item, ackState: nextState } : item,
  )
}

function deliverToMatchingSubscriptions(input: {
  connectionId: string
  subject: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  jetStream: boolean
  reply?: string
  headers?: Record<string, string>
  correlationId?: string
}) {
  const targets = mockState.subscriptions.filter(
    (item) => item.connectionId === input.connectionId && item.active && matchNatsSubject(input.subject, item.subject),
  )

  targets.forEach((subscription) => {
    subscription.messageCount += 1
    const payloadBytes = resolvePayloadBytes(input.payload, input.payloadBase64)
    appendMessage({
      id: createId('msg'),
      connectionId: input.connectionId,
      subscriptionId: subscription.id,
      subscriptionPattern: subscription.subject,
      direction: 'inbound',
      kind: input.reply ? 'request' : 'message',
      subject: input.subject,
      reply: input.reply,
      payload: payloadDisplayValue(payloadBytes),
      payloadBase64: bytesToBase64(payloadBytes),
      payloadEncoding: payloadDisplayEncoding(payloadBytes),
      size: payloadBytes.length,
      jetStream: input.jetStream,
      jetStreamStream: input.jetStream ? 'ORDERS' : undefined,
      jetStreamConsumer: input.jetStream ? 'orders-dashboard' : undefined,
      jetStreamSequence: input.jetStream ? Math.floor(Math.random() * 10000) + 1 : undefined,
      correlationId: input.correlationId,
      ackEligible: input.jetStream,
      ackState: input.jetStream ? 'pending' : undefined,
      receivedAt: createTimestamp(),
      headers: buildHeaders(input.headers),
    })
  })
}

function pickSubject(stream: StreamInfo | undefined, consumer: ConsumerInfo, index: number) {
  const filterSubject = consumer.filterSubject?.trim()
  if (filterSubject) {
    if (filterSubject.includes('>')) {
      return filterSubject.replace('>', `sample.${index + 1}`)
    }
    if (filterSubject.includes('*')) {
      return filterSubject.replace('*', `sample${index + 1}`)
    }
    return filterSubject
  }

  return stream?.subjects[index % (stream?.subjects.length || 1)] ?? `${consumer.streamName.toLowerCase()}.preview`
}

async function mockCall<T>(method: MethodName, args: unknown[]): Promise<T> {
  switch (method) {
    case 'GetSnapshot':
      return {
        generatedAt: createTimestamp(),
        connections: [...mockState.connections].sort((left, right) => {
          if (left.connected !== right.connected) {
            return left.connected ? -1 : 1
          }
          return right.updatedAt.localeCompare(left.updatedAt)
        }),
        subscriptions: [...mockState.subscriptions],
        messages: [...mockState.messages],
      } as T
    case 'SaveConnection': {
      const input = args[0] as ConnectionInput
      const connection: ConnectionProfile = {
        id: input.id ?? createId('conn'),
        name: input.name,
        url: input.url,
        authMode: input.authMode ?? 'none',
        username: input.username,
        password: input.password,
        token: input.token,
        certFile: input.certFile,
        keyFile: input.keyFile,
        caFile: input.caFile,
        nkeyOrSeed: input.nkeyOrSeed,
        credsFile: input.credsFile,
        group: input.group,
        description: input.description,
        connected: mockState.connections.find((item) => item.id === input.id)?.connected ?? false,
        updatedAt: createTimestamp(),
      }
      const index = mockState.connections.findIndex((item) => item.id === connection.id)
      if (index >= 0) {
        mockState.connections[index] = connection
      } else {
        mockState.connections.unshift(connection)
      }
      if (!mockState.streams[connection.id]) {
        mockState.streams[connection.id] = []
      }
      return connection as T
    }
    case 'DeleteConnection': {
      const connectionId = args[0] as string
      mockState.connections = mockState.connections.filter((item) => item.id !== connectionId)
      mockState.subscriptions = mockState.subscriptions.filter((item) => item.connectionId !== connectionId)
      mockState.messages = mockState.messages.filter((item) => item.connectionId !== connectionId)
      delete mockState.streams[connectionId]
      Object.keys(mockState.consumers)
        .filter((key) => key.startsWith(`${connectionId}__`))
        .forEach((key) => delete mockState.consumers[key])
      return undefined as T
    }
    case 'ExportConnections': {
      const input = (args[0] as ExportConnectionsRequest | undefined) ?? { maskSensitive: false }
      const items = mockState.connections.map((item) => buildConnectionPayload(item)).map((item) => ({
        ...item,
        password: input.maskSensitive && item.password ? '***MASKED***' : item.password,
        token: input.maskSensitive && item.token ? '***MASKED***' : item.token,
      }))
      const content = JSON.stringify(items, null, 2)
      return { content: `${content}\n`, count: items.length, masked: input.maskSensitive } as T
    }
    case 'ExportConnectionsToFile': {
      throw new Error('native file dialogs not supported in mock backend')
    }
    case 'ImportConnections': {
      const input = args[0] as ImportConnectionsRequest
      const parsed = parseImportedConnections(input.content)
      let imported = 0
      let skipped = 0
      parsed.forEach((item) => {
        if (!item.name?.trim() || !item.url?.trim()) {
          skipped += 1
          return
        }
        const connectionId = item.id?.trim() || createId('conn')
        const index = mockState.connections.findIndex((connection) => connection.id === connectionId)
        if (index >= 0 && !input.overwrite) {
          skipped += 1
          return
        }
        const connection: ConnectionProfile = {
          id: connectionId,
          name: item.name,
          url: item.url,
          authMode: item.authMode ?? 'none',
          username: item.username,
          password: item.password,
          token: item.token,
          certFile: item.certFile,
          keyFile: item.keyFile,
          caFile: item.caFile,
          nkeyOrSeed: item.nkeyOrSeed,
          credsFile: item.credsFile,
          group: item.group,
          description: item.description,
          connected: mockState.connections[index]?.connected ?? false,
          updatedAt: createTimestamp(),
        }
        if (index >= 0) {
          mockState.connections[index] = connection
        } else {
          mockState.connections.unshift(connection)
        }
        mockState.streams[connectionId] ??= []
        imported += 1
      })
      return { imported, skipped, connections: [...mockState.connections] } as T
    }
    case 'ImportConnectionsFromFile': {
      throw new Error('mock backend does not support native file dialogs')
    }
    case 'Connect': {
      const connectionId = args[0] as string
      const connection = mockState.connections.find((item) => item.id === connectionId)
      if (!connection) {
        throw new Error('连接不存在')
      }
      connection.connected = true
      connection.lastConnectedAt = createTimestamp()
      connection.updatedAt = createTimestamp()
      return connection as T
    }
    case 'Disconnect': {
      const connectionId = args[0] as string
      const connection = mockState.connections.find((item) => item.id === connectionId)
      if (connection) {
        connection.connected = false
      }
      mockState.subscriptions = mockState.subscriptions.map((item) =>
        item.connectionId === connectionId ? { ...item, active: false } : item,
      )
      return undefined as T
    }
    case 'Publish': {
      const input = args[0] as PublishRequest
      const payloadBytes = resolvePayloadBytes(input.payload, input.payloadBase64)
      appendMessage({
        id: createId('msg'),
        connectionId: input.connectionId,
        direction: 'outbound',
        kind: 'publish',
        subject: input.subject,
        payload: input.payload,
        payloadBase64: bytesToBase64(payloadBytes),
        payloadEncoding: normalizePayloadEncoding(input.payloadEncoding, input.payloadBase64),
        size: payloadBytes.length,
        jetStream: input.useJetStream,
        ackEligible: false,
        receivedAt: createTimestamp(),
        headers: buildHeaders(input.headers),
      })
      deliverToMatchingSubscriptions({
        connectionId: input.connectionId,
        subject: input.subject,
        payload: input.payload,
        payloadBase64: input.payloadBase64,
        payloadEncoding: input.payloadEncoding,
        jetStream: input.useJetStream,
        headers: input.headers,
      })
      return undefined as T
    }
    case 'RepublishMessage': {
      const input = args[0] as RepublishMessageRequest
      const source = mockState.messages.find((item) => item.id === input.messageId)
      if (!source) {
        throw new Error('源消息不存在')
      }
      const payloadBytes = resolvePayloadBytes(input.payload, input.payloadBase64)
      const message: MessageRecord = {
        id: createId('msg'),
        connectionId: source.connectionId,
        direction: 'outbound',
        kind: 'publish',
        subject: input.subject,
        payload: input.payload,
        payloadBase64: bytesToBase64(payloadBytes),
        payloadEncoding: normalizePayloadEncoding(input.payloadEncoding, input.payloadBase64),
        size: payloadBytes.length,
        headers: buildHeaders(input.headers),
        jetStream: input.useJetStream,
        jetStreamStream: input.useJetStream ? source.jetStreamStream : undefined,
        relatedMessageId: source.id,
        replaySourceMessageId: source.id,
        ackEligible: false,
        receivedAt: createTimestamp(),
      }
      appendMessage(message)
      deliverToMatchingSubscriptions({
        connectionId: source.connectionId,
        subject: input.subject,
        payload: input.payload,
        payloadBase64: input.payloadBase64,
        payloadEncoding: input.payloadEncoding,
        jetStream: input.useJetStream,
        headers: input.headers,
      })
      return { message } as T
    }
    case 'Request': {
      const input = args[0] as RequestMessageRequest
      const replyInbox = `_INBOX.${createId('mock')}`
      const startedAt = Date.now()
      const { headers, requestId } = ensureRequestId(input.headers, input.requestId)
      const payloadBytes = resolvePayloadBytes(input.payload, input.payloadBase64)
      const requestMessage: MessageRecord = {
        id: createId('msg'),
        connectionId: input.connectionId,
        direction: 'outbound',
        kind: 'request',
        subject: input.subject,
        reply: replyInbox,
        payload: input.payload,
        payloadBase64: bytesToBase64(payloadBytes),
        payloadEncoding: normalizePayloadEncoding(input.payloadEncoding, input.payloadBase64),
        size: payloadBytes.length,
        correlationId: requestId,
        requestTimeoutMs: input.timeoutMs,
        requestStatus: 'pending',
        jetStream: false,
        ackEligible: false,
        receivedAt: createTimestamp(),
        headers: buildHeaders(headers),
      }
      appendMessage(requestMessage)
      deliverToMatchingSubscriptions({
        connectionId: input.connectionId,
        subject: input.subject,
        payload: input.payload,
        payloadBase64: input.payloadBase64,
        payloadEncoding: input.payloadEncoding,
        jetStream: false,
        reply: replyInbox,
        headers,
        correlationId: requestId,
      })

      const shouldFail = input.subject.toLowerCase().includes('timeout') || input.subject.toLowerCase().includes('fail')
      if (shouldFail) {
        const duration = Math.max(1, Math.min(input.timeoutMs || 5000, 5000))
        updateMessage(requestMessage.id, (item) => ({
          ...item,
          requestStatus: 'failed',
          requestDurationMs: duration,
          errorMessage: 'mock request timed out',
        }))
        throw new Error('mock request timed out')
      }

      const responsePayload = JSON.stringify(
        {
          ok: true,
          echoedSubject: input.subject,
          receivedPayload: input.payload,
          requestId,
          note: 'mock backend generated this response',
        },
        null,
        2,
      )
      const duration = Math.max(1, Date.now() - startedAt)
      const responseBytes = mockEncoder.encode(responsePayload)
      const response: MessageRecord = {
        id: createId('msg'),
        connectionId: input.connectionId,
        direction: 'inbound',
        kind: 'response',
        subject: replyInbox,
        payload: responsePayload,
        payloadBase64: bytesToBase64(responseBytes),
        payloadEncoding: payloadDisplayEncoding(responseBytes),
        size: responseBytes.length,
        correlationId: requestId,
        relatedMessageId: requestMessage.id,
        requestDurationMs: duration,
        requestStatus: 'succeeded',
        jetStream: false,
        ackEligible: false,
        receivedAt: createTimestamp(),
        headers: buildHeaders({ [requestIdHeader]: requestId, 'content-type': 'application/json' }),
      }
      appendMessage(response)
      updateMessage(requestMessage.id, (item) => ({
        ...item,
        requestStatus: 'succeeded',
        requestDurationMs: duration,
        relatedMessageId: response.id,
        errorMessage: undefined,
      }))
      return { message: response } as T
    }
    case 'Reply': {
      const input = args[0] as ReplyRequest
      const { headers, requestId } = ensureRequestId(input.headers, input.requestId)
      const payloadBytes = resolvePayloadBytes(input.payload, input.payloadBase64)
      appendMessage({
        id: createId('msg'),
        connectionId: input.connectionId,
        direction: 'outbound',
        kind: 'reply',
        subject: input.replySubject,
        payload: input.payload,
        payloadBase64: bytesToBase64(payloadBytes),
        payloadEncoding: normalizePayloadEncoding(input.payloadEncoding, input.payloadBase64),
        size: payloadBytes.length,
        correlationId: requestId,
        relatedMessageId: input.sourceMessageId,
        jetStream: false,
        ackEligible: false,
        receivedAt: createTimestamp(),
        headers: buildHeaders(headers),
      })
      return undefined as T
    }
    case 'AckMessage': {
      const input = args[0] as MessageActionRequest
      updateAckState(input.messageId, 'acked')
      return undefined as T
    }
    case 'NakMessage': {
      const input = args[0] as MessageActionRequest
      updateAckState(input.messageId, 'nacked')
      return undefined as T
    }
    case 'TermMessage': {
      const input = args[0] as MessageActionRequest
      updateAckState(input.messageId, 'termed')
      return undefined as T
    }
    case 'UpsertStream': {
      const input = args[0] as StreamUpsertRequest
      const list = mockState.streams[input.connectionId] ?? []
      const stream: StreamInfo = {
        name: input.name,
        subjects: input.subjects,
        messages: list.find((item) => item.name === input.name)?.messages ?? 0,
        bytes: list.find((item) => item.name === input.name)?.bytes ?? 0,
        consumers: list.find((item) => item.name === input.name)?.consumers ?? 0,
        storage: input.storage,
        replicas: input.replicas,
      }
      const index = list.findIndex((item) => item.name === input.name)
      if (index >= 0) {
        list[index] = stream
      } else {
        list.unshift(stream)
      }
      mockState.streams[input.connectionId] = [...list]
      mockState.consumers[consumerKey(input.connectionId, input.name)] ??= []
      return stream as T
    }
    case 'DeleteStream': {
      const input = args[0] as StreamDeleteRequest
      mockState.streams[input.connectionId] = (mockState.streams[input.connectionId] ?? []).filter((item) => item.name !== input.name)
      delete mockState.consumers[consumerKey(input.connectionId, input.name)]
      mockState.messages = mockState.messages.filter(
        (item) => !(item.connectionId === input.connectionId && item.jetStreamStream === input.name),
      )
      return undefined as T
    }
    case 'UpsertConsumer': {
      const input = args[0] as ConsumerUpsertRequest
      const key = consumerKey(input.connectionId, input.streamName)
      const list = mockState.consumers[key] ?? []
      const existingConsumer = list.find((item) => item.name === input.name)
      const consumer: ConsumerInfo = {
        name: input.name,
        streamName: input.streamName,
        ackPolicy: input.ackPolicy,
        deliverPolicy: input.deliverPolicy,
        filterSubject: input.filterSubject,
        deliverSubject: existingConsumer?.deliverSubject,
        isPullMode: existingConsumer?.isPullMode ?? true,
        numPending: existingConsumer?.numPending ?? 0,
        numWaiting: existingConsumer?.numWaiting ?? 0,
        numAckPending: existingConsumer?.numAckPending ?? 0,
      }
      const index = list.findIndex((item) => item.name === input.name)
      if (index >= 0) {
        list[index] = consumer
      } else {
        list.unshift(consumer)
      }
      mockState.consumers[key] = [...list]
      const streamList = mockState.streams[input.connectionId] ?? []
      const streamIndex = streamList.findIndex((item) => item.name === input.streamName)
      if (streamIndex >= 0) {
        streamList[streamIndex] = { ...streamList[streamIndex], consumers: list.length }
        mockState.streams[input.connectionId] = [...streamList]
      }
      return consumer as T
    }
    case 'DeleteConsumer': {
      const input = args[0] as ConsumerDeleteRequest
      const key = consumerKey(input.connectionId, input.streamName)
      const before = mockState.consumers[key] ?? []
      mockState.consumers[key] = before.filter((item) => item.name !== input.consumerName)
      const streamList = mockState.streams[input.connectionId] ?? []
      const streamIndex = streamList.findIndex((item) => item.name === input.streamName)
      if (streamIndex >= 0) {
        streamList[streamIndex] = { ...streamList[streamIndex], consumers: mockState.consumers[key].length }
        mockState.streams[input.connectionId] = [...streamList]
      }
      mockState.messages = mockState.messages.filter(
        (item) => !(item.connectionId === input.connectionId && item.jetStreamStream === input.streamName && item.jetStreamConsumer === input.consumerName),
      )
      return undefined as T
    }
    case 'FetchConsumerMessages': {
      const input = args[0] as ConsumerFetchRequest
      const key = consumerKey(input.connectionId, input.streamName)
      const consumers = mockState.consumers[key] ?? []
      const consumer = consumers.find((item) => item.name === input.consumerName)
      if (!consumer) {
        throw new Error('Consumer 不存在')
      }
      if (!consumer.isPullMode) {
        throw new Error('当前 Consumer 为 Push 模式，不支持手动拉取')
      }

      const stream = (mockState.streams[input.connectionId] ?? []).find((item) => item.name === input.streamName)
      const batchSize = Math.max(1, Math.min(input.batchSize || 10, 256))
      const available = Math.max(0, consumer.numPending)
      const count = Math.min(batchSize, available)
      const fetchedMessages: MessageRecord[] = Array.from({ length: count }, (_, index) => {
        const subject = pickSubject(stream, consumer, index)
        const payload = JSON.stringify(
          {
            stream: input.streamName,
            consumer: input.consumerName,
            index: index + 1,
            fetchedAt: createTimestamp(),
            preview: `Mock pull message ${index + 1}`,
          },
          null,
          2,
        )

        return {
          id: createId('msg'),
          connectionId: input.connectionId,
          direction: 'inbound',
          kind: 'message',
          subject,
          payload,
          payloadBase64: bytesToBase64(mockEncoder.encode(payload)),
          payloadEncoding: 'text',
          size: mockEncoder.encode(payload).length,
          jetStream: true,
          jetStreamStream: input.streamName,
          jetStreamConsumer: input.consumerName,
          jetStreamSequence: Math.floor(Math.random() * 100000) + 1,
          ackEligible: true,
          ackState: 'pending',
          receivedAt: createTimestamp(),
        }
      })

      if (count > 0) {
        mockState.consumers[key] = consumers.map((item) =>
          item.name === input.consumerName
            ? {
                ...item,
                numPending: Math.max(0, item.numPending - count),
                numAckPending: item.numAckPending + count,
              }
            : item,
        )
        fetchedMessages.forEach((item) => appendMessage(item))
      }

      return { messages: fetchedMessages } as T
    }
    case 'Subscribe': {
      const input = args[0] as SubscribeRequest
      const subscription: SubscriptionInfo = {
        id: createId('sub'),
        connectionId: input.connectionId,
        subject: input.subject,
        queueGroup: input.queueGroup,
        active: true,
        messageCount: 0,
        createdAt: createTimestamp(),
      }
      mockState.subscriptions.unshift(subscription)
      return subscription as T
    }
    case 'UpdateSubscription': {
      const input = args[0] as UpdateSubscriptionRequest
      const subscription = mockState.subscriptions.find((item) => item.id === input.subscriptionId)
      if (!subscription) {
        throw new Error('subscription not found')
      }
      subscription.subject = input.subject.trim()
      subscription.queueGroup = input.queueGroup?.trim()
      return { ...subscription } as T
    }
    case 'SetSubscriptionState': {
      const input = args[0] as SetSubscriptionStateRequest
      const subscription = mockState.subscriptions.find((item) => item.id === input.subscriptionId)
      if (!subscription) {
        throw new Error('subscription not found')
      }
      subscription.active = input.active
      return { ...subscription } as T
    }
    case 'Unsubscribe': {
      const subscriptionId = args[0] as string
      mockState.subscriptions = mockState.subscriptions.map((item) =>
        item.id === subscriptionId ? { ...item, active: false } : item,
      )
      return undefined as T
    }
    case 'ListStreams': {
      const connectionId = args[0] as string
      return (mockState.streams[connectionId] ?? []) as T
    }
    case 'ListConsumers': {
      const connectionId = args[0] as string
      const streamName = args[1] as string
      return (mockState.consumers[consumerKey(connectionId, streamName)] ?? []) as T
    }
    case 'GetWindowState':
      return { ...mockWindowState } as T
    case 'GetAppSettings':
      return {
        ...mockState.appSettings,
        logRetention: { ...mockState.appSettings.logRetention },
      } as T
    case 'GetLogRetentionSettings':
      return { ...mockState.appSettings.logRetention } as T
    case 'SaveAppSettings': {
      const input = args[0] as AppSettings
      mockState.appSettings = {
        autoCheckUpdate: input.autoCheckUpdate ?? defaultAppSettings.autoCheckUpdate,
        autoResubscribe: input.autoResubscribe ?? defaultAppSettings.autoResubscribe,
        multiSubjectSubscribe: input.multiSubjectSubscribe ?? defaultAppSettings.multiSubjectSubscribe,
        maxReconnectTimes: Math.max(1, Math.floor(input.maxReconnectTimes || defaultAppSettings.maxReconnectTimes)),
        maxPayloadSize: Math.max(64, Math.floor(input.maxPayloadSize || defaultAppSettings.maxPayloadSize)),
        themeMode:
          input.themeMode === 'dark' || input.themeMode === 'system' ? input.themeMode : defaultAppSettings.themeMode,
        language: input.language === 'en-US' ? 'en-US' : defaultAppSettings.language,
        logRetention: {
          maxEntries: Math.max(
            1,
            Math.floor(input.logRetention?.maxEntries || defaultLogRetentionSettings.maxEntries),
          ),
          maxTotalBytes: Math.max(
            1,
            Math.floor(input.logRetention?.maxTotalBytes || defaultLogRetentionSettings.maxTotalBytes),
          ),
        },
      }
      trimMockMessages()
      return {
        ...mockState.appSettings,
        logRetention: { ...mockState.appSettings.logRetention },
      } as T
    }
    case 'SaveLogRetentionSettings': {
      const input = args[0] as LogRetentionSettings
      mockState.appSettings = {
        ...mockState.appSettings,
        logRetention: {
          maxEntries: Math.max(1, Math.floor(input.maxEntries || defaultLogRetentionSettings.maxEntries)),
          maxTotalBytes: Math.max(1, Math.floor(input.maxTotalBytes || defaultLogRetentionSettings.maxTotalBytes)),
        },
      }
      trimMockMessages()
      return { ...mockState.appSettings.logRetention } as T
    }
    case 'CheckForUpdates':
      return { ...mockUpdateInfo } as T
    case 'StartManualUpgrade':
      return { ...mockUpdateInfo } as T
    case 'DownloadUpdatePackage': {
      mockDownloadedUpdate = {
        path: `C:\\Users\\Public\\Downloads\\${mockUpdateInfo.assetName}`,
        assetName: mockUpdateInfo.assetName || 'NatsX-1.0.4-windows-amd64.zip',
        latestVersion: mockUpdateInfo.latestVersion,
        releaseUrl: mockUpdateInfo.releaseUrl,
        downloadUrl: mockUpdateInfo.downloadUrl,
        bytes: 128 * 1024 * 1024,
        downloadedAt: createTimestamp(),
      }
      return { ...mockDownloadedUpdate } as T
    }
    case 'GetUpdateState':
      return {
        downloadedPackage: mockDownloadedUpdate ? { ...mockDownloadedUpdate } : undefined,
      } as T
    case 'ImportCredentialsFile': {
      const existing = mockCredentialsFiles[0]
      if (existing) {
        return { ...existing, reused: true } as T
      }
      const timestamp = Date.now()
      const nextFile: ManagedResourceFile = {
        name: `imported-${timestamp}.creds`,
        path: `C:\\Program Files\\NatsX\\resources\\credentials\\imported-${timestamp}.creds`,
        relativePath: `imported-${timestamp}.creds`,
        size: 3072,
        updatedAt: createTimestamp(),
        reused: false,
      }
      mockCredentialsFiles = [nextFile, ...mockCredentialsFiles]
      return nextFile as T
    }
    case 'ListCredentialsFiles':
      return [...mockCredentialsFiles] as T
    case 'ImportTLSCertFile': {
      const nextFile: ManagedResourceFile = {
        name: 'client-cert.pem',
        path: 'C:\\Program Files\\NatsX\\resources\\tls\\certs\\client-cert.pem',
        relativePath: 'client-cert.pem',
        size: 4096,
        updatedAt: createTimestamp(),
        reused: mockTLSCertFiles.length > 0,
      }
      if (mockTLSCertFiles.length === 0) {
        mockTLSCertFiles = [nextFile]
      }
      return { ...(mockTLSCertFiles[0] ?? nextFile), reused: mockTLSCertFiles.length > 0 } as T
    }
    case 'ListTLSCertFiles':
      return [...mockTLSCertFiles] as T
    case 'ImportTLSKeyFile': {
      const nextFile: ManagedResourceFile = {
        name: 'client-key.pem',
        path: 'C:\\Program Files\\NatsX\\resources\\tls\\keys\\client-key.pem',
        relativePath: 'client-key.pem',
        size: 2048,
        updatedAt: createTimestamp(),
        reused: mockTLSKeyFiles.length > 0,
      }
      if (mockTLSKeyFiles.length === 0) {
        mockTLSKeyFiles = [nextFile]
      }
      return { ...(mockTLSKeyFiles[0] ?? nextFile), reused: mockTLSKeyFiles.length > 0 } as T
    }
    case 'ListTLSKeyFiles':
      return [...mockTLSKeyFiles] as T
    case 'ImportTLSCAFile': {
      const nextFile: ManagedResourceFile = {
        name: 'ca.pem',
        path: 'C:\\Program Files\\NatsX\\resources\\tls\\ca\\ca.pem',
        relativePath: 'ca.pem',
        size: 4096,
        updatedAt: createTimestamp(),
        reused: mockTLSCAFiles.length > 0,
      }
      if (mockTLSCAFiles.length === 0) {
        mockTLSCAFiles = [nextFile]
      }
      return { ...(mockTLSCAFiles[0] ?? nextFile), reused: mockTLSCAFiles.length > 0 } as T
    }
    case 'ListTLSCAFiles':
      return [...mockTLSCAFiles] as T
    case 'OpenDownloadedUpdate':
    case 'RevealDownloadedUpdate':
      return undefined as T
    case 'WindowMinimise': {
      mockWindowState.minimised = true
      mockWindowState.maximised = false
      mockWindowState.normal = false
      return undefined as T
    }
    case 'WindowToggleMaximise': {
      mockWindowState.maximised = !mockWindowState.maximised
      mockWindowState.minimised = false
      mockWindowState.fullscreen = false
      mockWindowState.normal = !mockWindowState.maximised
      return { ...mockWindowState } as T
    }
    case 'WindowClose':
      return undefined as T
    default:
      throw new Error(`unsupported mock method: ${method}`)
  }
}

async function invoke<T>(method: MethodName, ...args: unknown[]): Promise<T> {
  const target = window.go?.main?.App?.[method]
  if (typeof target === 'function') {
    return (await target(...args)) as T
  }
  if (window.go?.main?.App) {
    throw new Error(`Wails binding missing: ${method}`)
  }
  return mockCall<T>(method, args)
}

export const backend = {
  getSnapshot: () => invoke<Snapshot>('GetSnapshot'),
  saveConnection: (input: ConnectionInput) => invoke<ConnectionProfile>('SaveConnection', input),
  deleteConnection: (connectionId: string) => invoke<void>('DeleteConnection', connectionId),
  exportConnections: (request: ExportConnectionsRequest) => invoke<ExportConnectionsResponse>('ExportConnections', request),
  exportConnectionsToFile: (request: ExportConnectionsRequest) => invoke<ExportConnectionsFileResponse>('ExportConnectionsToFile', request),
  importConnections: (request: ImportConnectionsRequest) => invoke<ImportConnectionsResponse>('ImportConnections', request),
  importConnectionsFromFile: (request: ImportConnectionsFromFileRequest) => invoke<ImportConnectionsResponse>('ImportConnectionsFromFile', request),
  connect: (connectionId: string) => invoke<ConnectionProfile>('Connect', connectionId),
  disconnect: (connectionId: string) => invoke<void>('Disconnect', connectionId),
  publish: (request: PublishRequest) => invoke<void>('Publish', request),
  republishMessage: (request: RepublishMessageRequest) => invoke<RepublishMessageResponse>('RepublishMessage', request),
  request: (request: RequestMessageRequest) => invoke<RequestMessageResponse>('Request', request),
  reply: (request: ReplyRequest) => invoke<void>('Reply', request),
  ackMessage: (request: MessageActionRequest) => invoke<void>('AckMessage', request),
  nakMessage: (request: MessageActionRequest) => invoke<void>('NakMessage', request),
  termMessage: (request: MessageActionRequest) => invoke<void>('TermMessage', request),
  upsertStream: (request: StreamUpsertRequest) => invoke<StreamInfo>('UpsertStream', request),
  deleteStream: (request: StreamDeleteRequest) => invoke<void>('DeleteStream', request),
  upsertConsumer: (request: ConsumerUpsertRequest) => invoke<ConsumerInfo>('UpsertConsumer', request),
  deleteConsumer: (request: ConsumerDeleteRequest) => invoke<void>('DeleteConsumer', request),
  fetchConsumerMessages: (request: ConsumerFetchRequest) =>
    invoke<ConsumerFetchResponse>('FetchConsumerMessages', request),
  subscribe: (request: SubscribeRequest) => invoke<SubscriptionInfo>('Subscribe', request),
  updateSubscription: (request: UpdateSubscriptionRequest) =>
    invoke<SubscriptionInfo>('UpdateSubscription', request),
  setSubscriptionState: (request: SetSubscriptionStateRequest) =>
    invoke<SubscriptionInfo>('SetSubscriptionState', request),
  unsubscribe: (subscriptionId: string) => invoke<void>('Unsubscribe', subscriptionId),
  listStreams: (connectionId: string) => invoke<StreamInfo[]>('ListStreams', connectionId),
  listConsumers: (connectionId: string, streamName: string) =>
    invoke<ConsumerInfo[]>('ListConsumers', connectionId, streamName),
  getWindowState: () => invoke<WindowState>('GetWindowState'),
  getAppSettings: () => invoke<AppSettings>('GetAppSettings'),
  saveAppSettings: (settings: AppSettings) => invoke<AppSettings>('SaveAppSettings', settings),
  getLogRetentionSettings: () => invoke<LogRetentionSettings>('GetLogRetentionSettings'),
  saveLogRetentionSettings: (settings: LogRetentionSettings) =>
    invoke<LogRetentionSettings>('SaveLogRetentionSettings', settings),
  checkForUpdates: () => invoke<UpdateInfo>('CheckForUpdates'),
  startManualUpgrade: () => invoke<UpdateInfo>('StartManualUpgrade'),
  downloadUpdatePackage: () => invoke<UpdateDownloadResult>('DownloadUpdatePackage'),
  openDownloadedUpdate: (path: string) => invoke<void>('OpenDownloadedUpdate', path),
  getUpdateState: () => invoke<UpdateState>('GetUpdateState'),
  revealDownloadedUpdate: (path: string) => invoke<void>('RevealDownloadedUpdate', path),
  importCredentialsFile: () => invoke<ManagedResourceFile>('ImportCredentialsFile'),
  listCredentialsFiles: () => invoke<ManagedResourceFile[]>('ListCredentialsFiles'),
  importTLSCertFile: () => invoke<ManagedResourceFile>('ImportTLSCertFile'),
  listTLSCertFiles: () => invoke<ManagedResourceFile[]>('ListTLSCertFiles'),
  importTLSKeyFile: () => invoke<ManagedResourceFile>('ImportTLSKeyFile'),
  listTLSKeyFiles: () => invoke<ManagedResourceFile[]>('ListTLSKeyFiles'),
  importTLSCAFile: () => invoke<ManagedResourceFile>('ImportTLSCAFile'),
  listTLSCAFiles: () => invoke<ManagedResourceFile[]>('ListTLSCAFiles'),
  windowMinimise: () => invoke<void>('WindowMinimise'),
  windowToggleMaximise: () => invoke<WindowState>('WindowToggleMaximise'),
  windowClose: () => invoke<void>('WindowClose'),
}



