export interface Snapshot {
  generatedAt: string
  connections: ConnectionProfile[]
  subscriptions: SubscriptionInfo[]
  messages: MessageRecord[]
}

export interface WindowState {
  maximised: boolean
  minimised: boolean
  fullscreen: boolean
  normal: boolean
}

export interface LogRetentionSettings {
  maxTotalBytes: number
  maxEntries: number
}

export interface AppSettings {
  autoCheckUpdate: boolean
  autoResubscribe: boolean
  multiSubjectSubscribe: boolean
  maxReconnectTimes: number
  maxPayloadSize: number
  themeMode: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
  logRetention: LogRetentionSettings
}

export interface UpdateState {
  downloadedPackage?: UpdateDownloadResult
}

export interface ManagedResourceFile {
  name: string
  path: string
  relativePath: string
  size: number
  updatedAt: string
  reused?: boolean
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  releaseFound: boolean
  hasUpdate: boolean
  hasPlatformAsset: boolean
  platform: string
  releaseUrl?: string
  downloadUrl?: string
  assetName?: string
  publishedAt?: string
  releaseNotes?: string
}

export interface UpdateDownloadResult {
  path: string
  assetName: string
  latestVersion: string
  releaseUrl?: string
  downloadUrl?: string
  bytes: number
  downloadedAt: string
}

export interface UpdateDownloadProgress {
  status: 'downloading' | 'completed' | 'error'
  latestVersion?: string
  assetName?: string
  path?: string
  downloadedBytes: number
  totalBytes: number
  progressPercent: number
  errorMessage?: string
}

export type ConnectionAuthMode = 'none' | 'user' | 'token' | 'tls' | 'nkey' | 'creds'

export interface ConnectionProfile {
  id: string
  name: string
  url: string
  authMode?: ConnectionAuthMode
  username?: string
  password?: string
  token?: string
  certFile?: string
  keyFile?: string
  caFile?: string
  nkeyOrSeed?: string
  credsFile?: string
  group?: string
  description?: string
  connected: boolean
  lastError?: string
  lastConnectedAt?: string
  updatedAt: string
}

export interface ConnectionInput {
  id?: string
  name: string
  url: string
  authMode?: ConnectionAuthMode
  username?: string
  password?: string
  token?: string
  certFile?: string
  keyFile?: string
  caFile?: string
  nkeyOrSeed?: string
  credsFile?: string
  group?: string
  description?: string
}

export interface ExportConnectionsRequest {
  maskSensitive: boolean
}

export interface ExportConnectionsResponse {
  content: string
  count: number
  masked: boolean
}

export interface ExportConnectionsFileResponse {
  path: string
  count: number
  masked: boolean
}

export interface ImportConnectionsRequest {
  content: string
  overwrite: boolean
}

export interface ImportConnectionsFromFileRequest {
  overwrite: boolean
}

export interface ImportConnectionsResponse {
  imported: number
  skipped: number
  connections: ConnectionProfile[]
  sourcePath?: string
}

export interface PublishRequest {
  connectionId: string
  subject: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  headers?: Record<string, string>
  useJetStream: boolean
  useMsgId?: boolean
}

export interface RepublishMessageRequest {
  messageId: string
  subject: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  headers?: Record<string, string>
  useJetStream: boolean
}

export interface RepublishMessageResponse {
  message: MessageRecord
}

export interface RequestMessageRequest {
  connectionId: string
  subject: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  headers?: Record<string, string>
  requestId?: string
  replaySourceMessageId?: string
  timeoutMs: number
}

export interface RequestMessageResponse {
  message: MessageRecord
}

export interface ReplyRequest {
  connectionId: string
  replySubject: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  headers?: Record<string, string>
  requestId?: string
  sourceMessageId?: string
}

export interface MessageActionRequest {
  messageId: string
}

export interface StreamUpsertRequest {
  connectionId: string
  name: string
  subjects: string[]
  storage: string
  replicas: number
  maxAge?: number
  maxMsgs?: number
  maxBytes?: number
  maxMsgSize?: number
  retention?: string
  discard?: string
  duplicateWindow?: number
}

export interface StreamDeleteRequest {
  connectionId: string
  name: string
}

export interface ConsumerUpsertRequest {
  connectionId: string
  streamName: string
  name: string
  ackPolicy: string
  deliverPolicy: string
  filterSubject?: string
  deliverSubject?: string
  maxDeliver?: number
  ackWait?: number
  maxAckPending?: number
}

export interface ConsumerDeleteRequest {
  connectionId: string
  streamName: string
  consumerName: string
}

export interface ConsumerFetchRequest {
  connectionId: string
  streamName: string
  consumerName: string
  batchSize: number
  maxWaitMs: number
}

export interface ConsumerFetchResponse {
  messages: MessageRecord[]
}

export interface SubscribeRequest {
  connectionId: string
  subject: string
  queueGroup?: string
}

export interface UpdateSubscriptionRequest {
  subscriptionId: string
  subject: string
  queueGroup?: string
}

export interface SetSubscriptionStateRequest {
  subscriptionId: string
  active: boolean
}

export interface SubscriptionInfo {
  id: string
  connectionId: string
  subject: string
  queueGroup?: string
  active: boolean
  messageCount: number
  createdAt: string
}

export interface MessageRecord {
  id: string
  connectionId: string
  subscriptionId?: string
  subscriptionPattern?: string
  direction: 'inbound' | 'outbound'
  kind: 'publish' | 'message' | 'request' | 'response' | 'reply'
  subject: string
  reply?: string
  payload: string
  payloadBase64?: string
  payloadEncoding?: string
  headers?: Record<string, string[]>
  size: number
  jetStream: boolean
  jetStreamStream?: string
  jetStreamConsumer?: string
  jetStreamSequence?: number
  correlationId?: string
  relatedMessageId?: string
  replaySourceMessageId?: string
  requestDurationMs?: number
  requestTimeoutMs?: number
  requestStatus?: 'pending' | 'succeeded' | 'failed'
  errorMessage?: string
  ackEligible: boolean
  ackState?: 'pending' | 'acked' | 'nacked' | 'termed'
  receivedAt: string
}

export interface StreamInfo {
  name: string
  subjects: string[]
  messages: number
  bytes: number
  consumers: number
  storage: string
  replicas: number
}

export interface ConsumerInfo {
  name: string
  streamName: string
  ackPolicy: string
  deliverPolicy: string
  filterSubject?: string
  deliverSubject?: string
  isPullMode: boolean
  numPending: number
  numWaiting: number
  numAckPending: number
  maxDeliver?: number
  ackWait?: number
  maxAckPending?: number
}
