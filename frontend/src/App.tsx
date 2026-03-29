
import {
  ApartmentOutlined,
  CloudDownloadOutlined,
  CloseOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  EditOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  GlobalOutlined,
  HddOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MinusOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SettingOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Dropdown,
  Input,
  InputNumber,
  Layout,
  List,
  Progress,
  type MenuProps,
  Popconfirm,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

import { ConnectionEditor, ConnectionEditorPage } from './components/ConnectionEditor'
import { ConnectionTransferActions } from './components/ConnectionTransferActions'
import { useI18n } from './i18n/I18nProvider'
import { JetStreamOverview } from './components/JetStreamOverview'
import { LiveMessagePanel } from './components/LiveMessagePanel'
import { MessageHistory } from './components/MessageHistory'
import { MessageWorkbench } from './components/MessageWorkbench'
import { PublishForm } from './components/PublishForm'
import { RepublishComposer } from './components/RepublishComposer'
import { ReplyComposer } from './components/ReplyComposer'
import { RequestComparePanel } from './components/RequestComparePanel'
import { RequestPanel } from './components/RequestPanel'
import { SubscribeForm } from './components/SubscribeForm'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { backend } from './services/backend'
import { useTheme } from './theme/ThemeProvider'
import { formatHeaders } from './utils/nats'
import type { PayloadMode } from './utils/payload'
import { payloadModeOptions, transformPayloadForDisplay } from './utils/payload'
import type {
  AppSettings,
  ConnectionInput,
  ConnectionProfile,
  ConsumerDeleteRequest,
  ConsumerInfo,
  ConsumerUpsertRequest,
  ExportConnectionsFileResponse,
  ExportConnectionsRequest,
  ExportConnectionsResponse,
  ImportConnectionsFromFileRequest,
  ImportConnectionsRequest,
  ImportConnectionsResponse,
  MessageRecord,
  ReplyRequest,
  RepublishMessageRequest,
  RepublishMessageResponse,
  RequestMessageResponse,
  Snapshot,
  StreamDeleteRequest,
  StreamInfo,
  StreamUpsertRequest,
  UpdateDownloadResult,
  UpdateDownloadProgress,
  UpdateInfo,
  UpdateState,
  WindowState,
} from './types'

const { Header, Sider, Content } = Layout
const appName = 'NatsX'
const appVersion = '1.0.3'
const appLicense = 'Apache License 2.0'
const appAuthor = 'punk-one'
const requestIdHeader = 'X-NatsX-Request-Id'
const natsxLogo = new URL('./assets/natsx-logo.svg', import.meta.url).href
const natsxMark = new URL('./assets/natsx-mark.svg', import.meta.url).href
const defaultLogRetentionMaxEntries = 1000
const defaultLogRetentionMaxSizeMb = 100

type WorkspaceKey = 'messages' | 'request' | 'history' | 'jetstream'
type NavKey = 'connections' | 'newConnection' | 'viewer' | 'requestLab' | 'logs' | 'settings' | 'about'

const emptySnapshot: Snapshot = {
  generatedAt: new Date().toISOString(),
  connections: [],
  subscriptions: [],
  messages: [],
}

function createRequestId() {
  return `req_ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function flattenHeaders(headers?: Record<string, string[]>) {
  if (!headers) {
    return undefined
  }

  const nextHeaders = Object.fromEntries(Object.entries(headers).map(([key, values]) => [key, values.join(', ')]))
  Object.keys(nextHeaders).forEach((key) => {
    if (key.toLowerCase() === requestIdHeader.toLowerCase()) {
      delete nextHeaders[key]
    }
  })
  return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined
}

function authModeLabel(
  authMode: ConnectionProfile['authMode'] | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (authMode) {
    case 'user':
      return t('workspace.authUser')
    case 'token':
      return t('workspace.authToken')
    case 'tls':
      return t('workspace.authTls')
    case 'nkey':
      return t('workspace.authNkey')
    case 'creds':
      return t('workspace.authCreds')
    default:
      return t('workspace.authNone')
  }
}

function workspaceTitle(workspaceKey: WorkspaceKey) {
  switch (workspaceKey) {
    case 'messages':
      return 'Messages'
    case 'request':
      return 'Request / Reply'
    case 'history':
      return 'Message History'
    case 'jetstream':
      return 'JetStream'
    default:
      return 'Workbench'
  }
}

function navTitle(navKey: NavKey) {
  switch (navKey) {
    case 'connections':
      return 'Connections'
    case 'newConnection':
      return 'New Connection'
    case 'viewer':
      return 'Viewer'
    case 'requestLab':
      return 'Request Lab'
    case 'logs':
      return 'Logs'
    case 'settings':
      return 'Settings'
    case 'about':
      return 'About'
    default:
      return 'NatsX'
  }
}

function bytesToMegabytes(value: number) {
  return Math.max(1, Math.round(value / (1024 * 1024)))
}

function megabytesToBytes(value: number) {
  return Math.max(1, Math.round(value)) * 1024 * 1024
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let nextValue = value
  let unitIndex = 0

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024
    unitIndex += 1
  }

  const digits = nextValue >= 100 || unitIndex === 0 ? 0 : nextValue >= 10 ? 1 : 2
  return `${nextValue.toFixed(digits)} ${units[unitIndex]}`
}

function ellipsisMiddle(value: string, maxLength = 72) {
  if (!value || value.length <= maxLength) {
    return value
  }

  const sideLength = Math.max(8, Math.floor((maxLength - 1) / 2))
  return `${value.slice(0, sideLength)}…${value.slice(-sideLength)}`
}

export default function App() {
  const { message } = AntdApp.useApp()
  const { themeMode, resolvedTheme, setThemeMode } = useTheme()
  const { language, setLanguage, supportedLanguages, t } = useI18n()

  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [reconnectingIds, setReconnectingIds] = useState<Set<string>>(new Set())
  const [navKey, setNavKey] = useState<NavKey>('connections')
  const [workspaceKey, setWorkspaceKey] = useState<WorkspaceKey>('messages')
  const [messageSubjectFilter, setMessageSubjectFilter] = useState('')
  const [messageSidebarCollapsed, setMessageSidebarCollapsed] = useState(false)
  const [connectionSidebarCollapsed, setConnectionSidebarCollapsed] = useState(false)
  const [windowState, setWindowState] = useState<WindowState>({
    maximised: false,
    minimised: false,
    fullscreen: false,
    normal: true,
  })
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>()
  const [selectedHistoryMessage, setSelectedHistoryMessage] = useState<MessageRecord>()
  const [streams, setStreams] = useState<StreamInfo[]>([])
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([])
  const [selectedStream, setSelectedStream] = useState<string>()
  const [streamLoading, setStreamLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionProfile>()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyTarget, setReplyTarget] = useState<MessageRecord>()
  const [republishOpen, setRepublishOpen] = useState(false)
  const [republishTarget, setRepublishTarget] = useState<MessageRecord>()
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(true)
  const [autoResubscribe, setAutoResubscribe] = useState(true)
  const [multiSubjectSubscribe, setMultiSubjectSubscribe] = useState(true)
  const [maxReconnectTimes, setMaxReconnectTimes] = useState(10)
  const [maxPayloadSize, setMaxPayloadSize] = useState(512)
  const [messageSplitRatio, setMessageSplitRatio] = useState(0.6)
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearchDraftTopic, setMessageSearchDraftTopic] = useState('')
  const [messageSearchDraftPayload, setMessageSearchDraftPayload] = useState('')
  const [messageSearchTopic, setMessageSearchTopic] = useState('')
  const [messageSearchPayload, setMessageSearchPayload] = useState('')
  const [clearedMessageMap, setClearedMessageMap] = useState<Record<string, string[]>>({})
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'DEBUG' | 'ERROR'>('ALL')
  const [selectedLogMessageId, setSelectedLogMessageId] = useState<string>()
  const [logPayloadViewMode, setLogPayloadViewMode] = useState<PayloadMode>('json')
  const [logRetentionMaxEntries, setLogRetentionMaxEntries] = useState(defaultLogRetentionMaxEntries)
  const [logRetentionMaxSizeMb, setLogRetentionMaxSizeMb] = useState(defaultLogRetentionMaxSizeMb)
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>()
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [manualUpgradeLoading, setManualUpgradeLoading] = useState(false)
  const [downloadUpdateLoading, setDownloadUpdateLoading] = useState(false)
  const [downloadedUpdate, setDownloadedUpdate] = useState<UpdateDownloadResult>()
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<UpdateDownloadProgress>()
  const messageMainStackRef = useRef<HTMLDivElement>(null)
  const autoUpdateCheckedRef = useRef(false)

  const primaryNavItems = useMemo<Array<{ key: NavKey; label: string; icon: ReactNode }>>(
    () => [
      { key: 'connections', label: t('nav.connections'), icon: <CopyOutlined /> },
      { key: 'newConnection', label: t('nav.newConnection'), icon: <PlusOutlined /> },
      { key: 'viewer', label: t('nav.viewer'), icon: <ApartmentOutlined /> },
      { key: 'requestLab', label: t('nav.requestLab'), icon: <CodeOutlined /> },
      { key: 'logs', label: t('nav.logs'), icon: <FileSearchOutlined /> },
    ],
    [t],
  )

  const footerNavItems = useMemo<Array<{ key: NavKey; label: string; icon: ReactNode }>>(
    () => [
      { key: 'settings', label: t('nav.settings'), icon: <SettingOutlined /> },
      { key: 'about', label: t('nav.about'), icon: <InfoCircleOutlined /> },
    ],
    [t],
  )

  const languageMenuItems = useMemo<NonNullable<MenuProps['items']>>(
    () =>
      supportedLanguages.map((item) => ({
        key: item.code,
        label: `${item.nativeLabel} · ${item.label}`,
      })),
    [supportedLanguages],
  )

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await backend.getSnapshot()
    setSnapshot(nextSnapshot)
    setSelectedConnectionId((current) => {
      if (current && nextSnapshot.connections.some((connection) => connection.id === current)) {
        return current
      }
      return nextSnapshot.connections[0]?.id
    })
    return nextSnapshot
  }, [])

  const refreshStreams = useCallback(async (connectionId?: string, preferredStream?: string) => {
    if (!connectionId) {
      setStreams([])
      setConsumers([])
      setSelectedStream(undefined)
      return
    }

    setStreamLoading(true)
    try {
      const nextStreams = await backend.listStreams(connectionId)
      setStreams(nextStreams)
      const nextSelectedStream =
        preferredStream && nextStreams.some((stream) => stream.name === preferredStream)
          ? preferredStream
          : nextStreams[0]?.name
      setSelectedStream(nextSelectedStream)

      if (nextSelectedStream) {
        const nextConsumers = await backend.listConsumers(connectionId, nextSelectedStream)
        setConsumers(nextConsumers)
      } else {
        setConsumers([])
      }
    } finally {
      setStreamLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSnapshot()
    const timer = window.setInterval(() => {
      void refreshSnapshot()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [refreshSnapshot])

  useEffect(() => {
    return EventsOn('natsx:connection_state', (event: { connectionId: string; connected: boolean }) => {
      setReconnectingIds((current) => {
        const next = new Set(current)
        if (event.connected) {
          next.delete(event.connectionId)
        } else {
          next.add(event.connectionId)
        }
        return next
      })
      void refreshSnapshot()
    })
  }, [refreshSnapshot])

  useEffect(() => {
    return EventsOn('natsx:message', (record: MessageRecord) => {
      setSnapshot((current) => {
        const messages = [record, ...current.messages].slice(0, Math.max(1, logRetentionMaxEntries))
        return { ...current, messages }
      })
    })
  }, [logRetentionMaxEntries])

  useEffect(() => {
    return EventsOn('natsx:update_download_progress', (event: UpdateDownloadProgress) => {
      setUpdateDownloadProgress(event)
    })
  }, [])

  useEffect(() => {
    if (workspaceKey !== 'messages' && messageSearchOpen) {
      setMessageSearchOpen(false)
    }
  }, [messageSearchOpen, workspaceKey])

  useEffect(() => {
    setMessageSearchDraftTopic('')
    setMessageSearchDraftPayload('')
    setMessageSearchTopic('')
    setMessageSearchPayload('')
    setMessageSearchOpen(false)
    setSelectedHistoryMessage(undefined)
  }, [selectedConnectionId])

  useEffect(() => {
    void backend
      .getWindowState()
      .then(setWindowState)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false

    void backend
      .getAppSettings()
      .then((settings: AppSettings) => {
        if (cancelled) {
          return
        }
        setAutoCheckUpdate(settings.autoCheckUpdate)
        setAutoResubscribe(settings.autoResubscribe)
        setMultiSubjectSubscribe(settings.multiSubjectSubscribe)
        setMaxReconnectTimes(settings.maxReconnectTimes)
        setMaxPayloadSize(settings.maxPayloadSize)
        setLogRetentionMaxEntries(settings.logRetention.maxEntries)
        setLogRetentionMaxSizeMb(bytesToMegabytes(settings.logRetention.maxTotalBytes))
        if (settings.themeMode) {
          setThemeMode(settings.themeMode)
        }
        if (settings.language) {
          setLanguage(settings.language)
        }
        setAppSettingsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setAppSettingsLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [setLanguage, setThemeMode])

  useEffect(() => {
    void backend
      .getUpdateState()
      .then((state: UpdateState) => {
        if (state.downloadedPackage?.path) {
          setDownloadedUpdate(state.downloadedPackage)
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!appSettingsLoaded) {
      return
    }

    const timer = window.setTimeout(() => {
      void backend.saveAppSettings({
        autoCheckUpdate,
        autoResubscribe,
        multiSubjectSubscribe,
        maxReconnectTimes,
        maxPayloadSize,
        themeMode,
        language,
        logRetention: {
          maxEntries: logRetentionMaxEntries,
          maxTotalBytes: megabytesToBytes(logRetentionMaxSizeMb),
        },
      })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [
    appSettingsLoaded,
    autoCheckUpdate,
    autoResubscribe,
    multiSubjectSubscribe,
    maxReconnectTimes,
    maxPayloadSize,
    themeMode,
    language,
    logRetentionMaxEntries,
    logRetentionMaxSizeMb,
  ])

  const handleCheckForUpdates = useCallback(
    async (options?: { silentWhenLatest?: boolean; notifyWhenAvailable?: boolean }) => {
      setCheckingUpdates(true)
      try {
        const info = await backend.checkForUpdates()
        setUpdateInfo(info)
        if (!info.releaseFound) {
          if (!options?.silentWhenLatest) {
            message.info(t('messages.noRelease'))
          }
        } else if (info.hasUpdate) {
          if (options?.notifyWhenAvailable) {
            message.info(t('messages.updateAvailable', { version: info.latestVersion }))
          } else {
            message.success(t('messages.updateChecked', { version: info.latestVersion }))
          }
        } else if (!options?.silentWhenLatest) {
          message.success(t('messages.latest'))
        }
        return info
      } catch (error) {
        if (!options?.silentWhenLatest) {
          message.error(error instanceof Error ? error.message : t('messages.checkFailed'))
        }
        throw error
      } finally {
        setCheckingUpdates(false)
      }
    },
    [message, t],
  )

  const handleManualUpgrade = useCallback(async () => {
    setManualUpgradeLoading(true)
    try {
      const info = await backend.startManualUpgrade()
      setUpdateInfo(info)
      message.success(info.downloadUrl ? t('messages.manualUpgradeOpened') : t('messages.releaseOpened'))
      return info
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.manualUpgradeFailed'))
      message.error(nextError.message)
      throw nextError
    } finally {
      setManualUpgradeLoading(false)
    }
  }, [message, t])

  const handleDownloadUpdatePackage = useCallback(async () => {
    setDownloadUpdateLoading(true)
    try {
      setUpdateDownloadProgress({
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
        progressPercent: 0,
      })
      const result = await backend.downloadUpdatePackage()
      setDownloadedUpdate(result)
      message.success(t('messages.downloadSavedVerified', { path: result.path }))
      return result
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.downloadFailed'))
      setUpdateDownloadProgress((current) =>
        current
          ? {
              ...current,
              status: 'error',
              errorMessage: nextError.message,
            }
          : {
              status: 'error',
              downloadedBytes: 0,
              totalBytes: 0,
              progressPercent: 0,
              errorMessage: nextError.message,
            },
      )
      if (!/canceled/i.test(nextError.message)) {
        message.error(nextError.message)
      }
      throw nextError
    } finally {
      setDownloadUpdateLoading(false)
    }
  }, [message, t])

  const handleOpenDownloadedUpdate = useCallback(async () => {
    if (!downloadedUpdate?.path) {
      message.info(t('messages.downloadFirst'))
      return
    }
    try {
      await backend.openDownloadedUpdate(downloadedUpdate.path)
      message.success(t('messages.installerOpened'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.installerOpenFailed'))
    }
  }, [downloadedUpdate?.path, message, t])

  const handleRevealDownloadedUpdate = useCallback(async () => {
    if (!downloadedUpdate?.path) {
      message.info(t('messages.downloadFirst'))
      return
    }
    try {
      await backend.revealDownloadedUpdate(downloadedUpdate.path)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.folderOpenFailed'))
    }
  }, [downloadedUpdate?.path, message, t])

  useEffect(() => {
    if (!appSettingsLoaded || !autoCheckUpdate || autoUpdateCheckedRef.current) {
      return
    }
    autoUpdateCheckedRef.current = true
    void handleCheckForUpdates({ silentWhenLatest: true, notifyWhenAvailable: true })
  }, [appSettingsLoaded, autoCheckUpdate, handleCheckForUpdates])

  useEffect(() => {
    document.title = appName

    let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.appendChild(favicon)
    }

    favicon.type = 'image/svg+xml'
    favicon.href = natsxMark
  }, [])

  useEffect(() => {
    const syncViewportHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }

    syncViewportHeight()
    window.addEventListener('resize', syncViewportHeight)
    return () => window.removeEventListener('resize', syncViewportHeight)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--window-bottom-safe-area', windowState.maximised ? '4px' : '0px')
    document.documentElement.style.setProperty('--window-right-safe-area', windowState.maximised ? '4px' : '0px')
  }, [windowState.maximised])

  useEffect(() => {
    void refreshStreams(selectedConnectionId, selectedStream)
  }, [refreshStreams, selectedConnectionId])

  const activeConnection = useMemo(
    () => snapshot.connections.find((connection) => connection.id === selectedConnectionId),
    [selectedConnectionId, snapshot.connections],
  )

  const connectionOptions = useMemo(
    () =>
      snapshot.connections.map((connection) => ({
        value: connection.id,
        label: `${connection.name} @ ${connection.url.replace(/^nats:\/\//, '')}`,
      })),
    [snapshot.connections],
  )

  const groupedConnections = useMemo(() => {
    const groupMap = new Map<string, ConnectionProfile[]>()
    for (const connection of snapshot.connections) {
      const key = connection.group?.trim() || t('workspace.defaultGroup')
      const existing = groupMap.get(key)
      if (existing) {
        existing.push(connection)
      } else {
        groupMap.set(key, [connection])
      }
    }
    return Array.from(groupMap.entries()).map(([group, connections]) => ({ group, connections }))
  }, [snapshot.connections, t])

  const connectionSubscriptions = useMemo(
    () => snapshot.subscriptions.filter((subscription) => subscription.connectionId === selectedConnectionId),
    [selectedConnectionId, snapshot.subscriptions],
  )

  const connectionMessages = useMemo(
    () => {
      const clearedMessageIds = selectedConnectionId ? clearedMessageMap[selectedConnectionId] : undefined
      const clearedMessageIdSet = clearedMessageIds?.length ? new Set(clearedMessageIds) : undefined

      return snapshot.messages.filter((item) => {
        if (item.connectionId !== selectedConnectionId) {
          return false
        }
        if (!clearedMessageIdSet) {
          return true
        }
        return !clearedMessageIdSet.has(item.id)
      })
    },
    [clearedMessageMap, selectedConnectionId, snapshot.messages],
  )

  const recentRequests = useMemo(
    () =>
      connectionMessages
        .filter((item) => item.direction === 'outbound' && item.kind === 'request')
        .slice(0, 8),
    [connectionMessages],
  )

  const viewerCandidates = useMemo(
    () =>
      [...connectionMessages]
        .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
        .slice(0, 120),
    [connectionMessages],
  )

  const logEntries = useMemo(
    () =>
      snapshot.messages.slice(0, 160).map((item, index) => {
        const time = new Date(item.receivedAt).toLocaleString()
        const level = item.requestStatus === 'failed' ? 'ERROR' : item.kind === 'request' ? 'DEBUG' : 'INFO'
        const connectionName =
          snapshot.connections.find((connection) => connection.id === item.connectionId)?.name ?? item.connectionId
        const summary =
          item.kind === 'response'
            ? t('workspace.summaryResponse', { subject: item.subject })
            : item.kind === 'request'
              ? t('workspace.summaryRequest', { subject: item.subject })
              : item.kind === 'publish'
                ? t('workspace.summaryPublish', { subject: item.subject })
                : t('workspace.summaryReceive', { subject: item.subject })

        return {
          key: item.id,
          line: snapshot.messages.length - index,
          level,
          time,
          summary,
          connectionName,
          message: item,
          text: `[${time}] [${level}] ${connectionName} · ${summary} · ${item.payload.length} bytes`,
        }
      }),
    [snapshot.connections, snapshot.messages, t],
  )

  const filteredLogEntries = useMemo(
    () => (logLevelFilter === 'ALL' ? logEntries : logEntries.filter((entry) => entry.level === logLevelFilter)),
    [logEntries, logLevelFilter],
  )

  const selectedLogEntry = useMemo(
    () => filteredLogEntries.find((entry) => entry.message.id === selectedLogMessageId) ?? filteredLogEntries[0],
    [filteredLogEntries, selectedLogMessageId],
  )

  const selectedLogPayload = useMemo(() => {
    if (!selectedLogEntry) {
      return ''
    }

    try {
      return transformPayloadForDisplay(
        selectedLogEntry.message.payload,
        selectedLogEntry.message.payloadBase64,
        logPayloadViewMode,
      )
    } catch {
      return selectedLogEntry.message.payload
    }
  }, [logPayloadViewMode, selectedLogEntry])

  useEffect(() => {
    if (!selectedHistoryMessage) {
      return
    }
    if (selectedHistoryMessage.connectionId !== selectedConnectionId) {
      setSelectedHistoryMessage(undefined)
    }
  }, [selectedConnectionId, selectedHistoryMessage])

  useEffect(() => {
    if (!filteredLogEntries.some((entry) => entry.message.id === selectedLogMessageId)) {
      setSelectedLogMessageId(filteredLogEntries[0]?.message.id)
    }
  }, [filteredLogEntries, selectedLogMessageId])

  useEffect(() => {
    setMessageSubjectFilter('')
  }, [selectedConnectionId])

  useEffect(() => {
    setMessageSidebarCollapsed(false)
  }, [selectedConnectionId])

  useEffect(() => {
    if (navKey !== 'viewer') {
      return
    }

    if (!viewerCandidates.length) {
      return
    }

    if (!selectedHistoryMessage || !viewerCandidates.some((item) => item.id === selectedHistoryMessage.id)) {
      setSelectedHistoryMessage(viewerCandidates[0])
    }
  }, [navKey, selectedHistoryMessage, viewerCandidates])

  const handleSaveConnection = async (input: ConnectionInput) => {
    try {
      await backend.saveConnection(input)
      setEditorOpen(false)
      setEditingConnection(undefined)
      await refreshSnapshot()
      message.success(t('messages.connectionSaved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.saveConnectionFailed'))
    }
  }

  const handleConnect = async () => {
    if (!selectedConnectionId) {
      return
    }
    try {
      await backend.connect(selectedConnectionId)
      await refreshSnapshot()
      await refreshStreams(selectedConnectionId)
      message.success(t('messages.connectionSuccess'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.connectionFailed'))
    }
  }

  const handleDisconnect = async () => {
    if (!selectedConnectionId) {
      return
    }
    try {
      await backend.disconnect(selectedConnectionId)
      await refreshSnapshot()
      await refreshStreams(selectedConnectionId)
      message.success(t('messages.disconnected'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.disconnectFailed'))
    }
  }

  const handleOpenMessageSearch = () => {
    setMessageSearchDraftTopic(messageSearchTopic)
    setMessageSearchDraftPayload(messageSearchPayload)
    setMessageSearchOpen(true)
  }

  const handleApplyMessageSearch = () => {
    setMessageSearchTopic(messageSearchDraftTopic.trim())
    setMessageSearchPayload(messageSearchDraftPayload.trim())
  }

  const handleCloseMessageSearch = () => {
    setMessageSearchOpen(false)
    setMessageSearchDraftTopic('')
    setMessageSearchDraftPayload('')
    setMessageSearchTopic('')
    setMessageSearchPayload('')
  }

  const handleClearMessageHistory = () => {
    if (!selectedConnectionId) {
      return
    }
    setClearedMessageMap((current) => ({
      ...current,
      [selectedConnectionId]: Array.from(
        new Set([...(current[selectedConnectionId] ?? []), ...connectionMessages.map((item) => item.id)]),
      ),
    }))
    setSelectedHistoryMessage(undefined)
    message.success(t('messages.messagesCleared'))
  }

  const messageMoreMenuItems: MenuProps['items'] = [
    {
      key: 'search',
      icon: <FileSearchOutlined />,
      label: 'Search',
      disabled: workspaceKey !== 'messages',
    },
    {
      key: 'clear-history',
      icon: <DeleteOutlined />,
      label: 'Clear History',
      danger: true,
      disabled: !selectedConnectionId || workspaceKey !== 'messages' || connectionMessages.length === 0,
    },
  ]

  const handleMessageMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'search') {
      handleOpenMessageSearch()
      return
    }
    if (key === 'clear-history') {
      handleClearMessageHistory()
    }
  }

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      await backend.deleteConnection(connectionId)
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(undefined)
      }
      await refreshSnapshot()
      message.success(t('messages.connectionDeleted'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.connectionDeleteFailed'))
    }
  }

  const handleExportConnections = async (
    request: ExportConnectionsRequest,
  ): Promise<ExportConnectionsResponse> => {
    try {
      const response = await backend.exportConnections(request)
      message.success(t('messages.exportConnectionsSuccess', { count: response.count }))
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.exportConnectionsFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleExportConnectionsToFile = async (
    request: ExportConnectionsRequest,
  ): Promise<ExportConnectionsFileResponse> => {
    try {
      const response = await backend.exportConnectionsToFile(request)
      message.success(t('messages.exportToFileSuccess', { count: response.count }))
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.exportToFileFailed'))
      const normalized = nextError.message.toLowerCase()
      if (!normalized.includes('canceled') && !normalized.includes('native file dialogs not supported')) {
        message.error(nextError.message)
      }
      throw nextError
    }
  }

  const handleImportConnections = async (
    request: ImportConnectionsRequest,
  ): Promise<ImportConnectionsResponse> => {
    try {
      const response = await backend.importConnections(request)
      await refreshSnapshot()
      message.success(t('messages.importComplete', { imported: response.imported, skipped: response.skipped }))
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.importConnectionsFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleImportConnectionsFromFile = async (
    request: ImportConnectionsFromFileRequest,
  ): Promise<ImportConnectionsResponse> => {
    try {
      const response = await backend.importConnectionsFromFile(request)
      await refreshSnapshot()
      message.success(t('messages.importFromFileSuccess', { count: response.imported }))
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.importFromFileFailed'))
      const normalized = nextError.message.toLowerCase()
      if (!normalized.includes('canceled') && !normalized.includes('native file dialogs not supported')) {
        message.error(nextError.message)
      }
      throw nextError
    }
  }

  const handlePublish = async (
    payload: {
      subject: string
      payload: string
      payloadBase64?: string
      payloadEncoding: string
      useJetStream: boolean
      headers?: Record<string, string>
    },
    options?: {
      silent?: boolean
    },
  ) => {
    if (!selectedConnectionId) {
      return
    }
    try {
      await backend.publish({
        connectionId: selectedConnectionId,
        subject: payload.subject,
        payload: payload.payload,
        payloadBase64: payload.payloadBase64,
        payloadEncoding: payload.payloadEncoding,
        useJetStream: payload.useJetStream,
        headers: payload.headers,
      })
      await refreshSnapshot()
      if (!options?.silent) {
        message.success(t('messages.publishSuccess'))
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.publishFailed'))
    }
  }

  const performRequest = useCallback(
    async (
      payload: {
        subject: string
        payload: string
        payloadBase64?: string
        payloadEncoding: string
        timeoutMs: number
        requestId?: string
        replaySourceMessageId?: string
        headers?: Record<string, string>
      },
      successText = t('messages.requestComplete'),
    ): Promise<RequestMessageResponse> => {
      if (!selectedConnectionId) {
        throw new Error(t('messages.selectConnectionFirst'))
      }

      const requestId = payload.requestId?.trim() || createRequestId()

      try {
        const response = await backend.request({
          connectionId: selectedConnectionId,
          subject: payload.subject,
          payload: payload.payload,
          payloadBase64: payload.payloadBase64,
          payloadEncoding: payload.payloadEncoding,
          timeoutMs: payload.timeoutMs,
          requestId,
          replaySourceMessageId: payload.replaySourceMessageId,
          headers: payload.headers,
        })
        const nextSnapshot = await refreshSnapshot()
        const nextSelected = nextSnapshot.messages.find(
          (item) => item.kind === 'response' && item.correlationId === requestId && item.connectionId === selectedConnectionId,
        )
        setSelectedHistoryMessage(nextSelected ?? response.message)
        message.success(successText)
        return response
      } catch (error) {
        const nextSnapshot = await refreshSnapshot()
        const failedRequest = nextSnapshot.messages.find(
          (item) => item.kind === 'request' && item.correlationId === requestId && item.connectionId === selectedConnectionId,
        )
        setSelectedHistoryMessage(failedRequest)
        const nextError = error instanceof Error ? error : new Error(t('messages.requestFailed'))
        message.error(nextError.message)
        throw nextError
      }
    },
    [message, refreshSnapshot, selectedConnectionId, t],
  )

  const handleRequest = (payload: {
    subject: string
    payload: string
    payloadBase64?: string
    payloadEncoding: string
    timeoutMs: number
    requestId?: string
    headers?: Record<string, string>
  }) => performRequest(payload)

  const handleReplayRequest = async (messageRecord: MessageRecord) => {
    try {
      await performRequest(
        {
          subject: messageRecord.subject,
          payload: messageRecord.payload,
          payloadBase64: messageRecord.payloadBase64,
          payloadEncoding: messageRecord.payloadEncoding || 'text',
          timeoutMs: messageRecord.requestTimeoutMs || 5000,
          replaySourceMessageId: messageRecord.replaySourceMessageId || messageRecord.id,
          headers: flattenHeaders(messageRecord.headers),
        },
        t('messages.requestReplayed'),
      )
      setWorkspaceKey('request')
    } catch {
      return
    }
  }

  const handleRepublishMessage = async (
    payload: RepublishMessageRequest,
  ): Promise<RepublishMessageResponse> => {
    try {
      const response = await backend.republishMessage(payload)
      const nextSnapshot = await refreshSnapshot()
      const nextSelected = nextSnapshot.messages.find((item) => item.id === response.message.id)
      setSelectedHistoryMessage(nextSelected ?? response.message)
      setRepublishOpen(false)
      setRepublishTarget(undefined)
      message.success(t('messages.republishSuccess'))
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.republishFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleReply = async (payload: ReplyRequest) => {
    try {
      await backend.reply(payload)
      await refreshSnapshot()
      setReplyOpen(false)
      setReplyTarget(undefined)
      message.success(t('messages.replySent'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.replyFailed'))
    }
  }

  const handleAckAction = async (messageRecord: MessageRecord, action: 'ack' | 'nak' | 'term') => {
    try {
      if (action === 'ack') {
        await backend.ackMessage({ messageId: messageRecord.id })
        message.success(t('messages.ackSent'))
      } else if (action === 'nak') {
        await backend.nakMessage({ messageId: messageRecord.id })
        message.success(t('messages.nakSent'))
      } else {
        await backend.termMessage({ messageId: messageRecord.id })
        message.success(t('messages.termSent'))
      }
      await refreshSnapshot()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.ackFailed'))
    }
  }

  const handleSaveStream = async (payload: StreamUpsertRequest) => {
    try {
      await backend.upsertStream(payload)
      await refreshStreams(payload.connectionId, payload.name)
      message.success(t('messages.streamSaved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.streamSaveFailed'))
    }
  }

  const handleSaveConsumer = async (payload: ConsumerUpsertRequest) => {
    try {
      await backend.upsertConsumer(payload)
      await refreshStreams(payload.connectionId, payload.streamName)
      message.success(t('messages.consumerSaved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.consumerSaveFailed'))
    }
  }

  const handleDeleteStream = async (payload: StreamDeleteRequest) => {
    try {
      await backend.deleteStream(payload)
      await refreshStreams(payload.connectionId)
      await refreshSnapshot()
      message.success(t('messages.streamDeleted'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.streamDeleteFailed'))
    }
  }

  const handleDeleteConsumer = async (payload: ConsumerDeleteRequest) => {
    try {
      await backend.deleteConsumer(payload)
      await refreshStreams(payload.connectionId, payload.streamName)
      await refreshSnapshot()
      message.success(t('messages.consumerDeleted'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.consumerDeleteFailed'))
    }
  }

  const handleFetchConsumer = async (payload: {
    connectionId: string
    streamName: string
    consumerName: string
    batchSize: number
    maxWaitMs: number
  }) => {
    try {
      const response = await backend.fetchConsumerMessages(payload)
      await refreshSnapshot()
      await refreshStreams(payload.connectionId, payload.streamName)
      message.success(
        response.messages.length > 0
          ? t('messages.fetchMessagesSuccess', { count: response.messages.length })
          : t('messages.fetchMessagesEmpty'),
      )
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.fetchMessagesFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleSubscribe = async (payload: { subject: string; queueGroup?: string }) => {
    if (!selectedConnectionId) {
      return
    }
    try {
      await backend.subscribe({
        connectionId: selectedConnectionId,
        subject: payload.subject,
        queueGroup: payload.queueGroup,
      })
      await refreshSnapshot()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.subscribeFailed'))
      throw error
    }
  }

  const handleUpdateSubscription = async (payload: {
    subscriptionId: string
    subject: string
    queueGroup?: string
  }) => {
    try {
      const response = await backend.updateSubscription(payload)
      await refreshSnapshot()
      return response
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('messages.updateSubscriptionFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleSetSubscriptionState = async (payload: { subscriptionId: string; active: boolean }) => {
    try {
      const response = await backend.setSubscriptionState(payload)
      await refreshSnapshot()
      return response
    } catch (error) {
      const nextError =
        error instanceof Error
          ? error
          : new Error(payload.active ? t('messages.enableSubscriptionFailed') : t('messages.disableSubscriptionFailed'))
      message.error(nextError.message)
      throw nextError
    }
  }

  const handleSelectStream = async (streamName: string) => {
    setSelectedStream(streamName)
    if (!selectedConnectionId) {
      return
    }
    try {
      setStreamLoading(true)
      const nextConsumers = await backend.listConsumers(selectedConnectionId, streamName)
      setConsumers(nextConsumers)
    } finally {
      setStreamLoading(false)
    }
  }

  const handleWindowMinimise = async () => {
    try {
      await backend.windowMinimise()
      setWindowState((current) => ({
        ...current,
        minimised: true,
        maximised: false,
        normal: false,
      }))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.minimizeFailed'))
    }
  }

  const handleWindowToggleMaximise = async () => {
    try {
      const nextState = await backend.windowToggleMaximise()
      setWindowState(nextState)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.toggleWindowFailed'))
    }
  }

  const handleWindowClose = async () => {
    try {
      await backend.windowClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('messages.closeWindowFailed'))
    }
  }

  const handleMessageSplitDragStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const container = messageMainStackRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      if (rect.height <= 0) {
        return
      }

      const nextRatio = (moveEvent.clientY - rect.top) / rect.height
      const clampedRatio = Math.min(0.78, Math.max(0.3, nextRatio))
      setMessageSplitRatio(clampedRatio)
    }

    const handlePointerUp = () => {
      document.body.classList.remove('split-resizing')
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }

    document.body.classList.add('split-resizing')
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
  }, [])

  const renderWorkspace = () => {
    if (!activeConnection) {
      return null
    }

    switch (workspaceKey) {
      case 'messages':
        return (
          <div
            className={`workspace-grid workspace-grid-message ${
              messageSidebarCollapsed ? 'workspace-grid-message-collapsed' : ''
            }`}
          >
            <div
              className={`workspace-column workspace-column-narrow ${
                messageSidebarCollapsed ? 'workspace-column-hidden' : ''
              }`}
            >
              <SubscribeForm
                disabled={!activeConnection.connected}
                subscriptions={connectionSubscriptions}
                selectedSubject={messageSubjectFilter}
                onSelectSubject={setMessageSubjectFilter}
                onSubscribe={handleSubscribe}
                onUpdateSubscription={handleUpdateSubscription}
                onSetSubscriptionState={handleSetSubscriptionState}
              />
            </div>
            <div className="workspace-column workspace-column-fluid">
              <div
                ref={messageMainStackRef}
                className="message-main-stack"
                style={{ gridTemplateRows: `${messageSplitRatio}fr 4px ${1 - messageSplitRatio}fr` }}
              >
                <LiveMessagePanel
                  messages={connectionMessages}
                  selectedMessage={selectedHistoryMessage}
                  subjectFilter={messageSubjectFilter}
                  searchTopic={messageSearchTopic}
                  searchPayload={messageSearchPayload}
                  onSelectMessage={setSelectedHistoryMessage}
                  onReply={(nextMessage) => {
                    setReplyTarget(nextMessage)
                    setReplyOpen(true)
                  }}
                  onReplayRequest={(nextMessage) => void handleReplayRequest(nextMessage)}
                  onRepublish={(nextMessage) => {
                    setRepublishTarget(nextMessage)
                    setRepublishOpen(true)
                  }}
                  onAck={(nextMessage) => void handleAckAction(nextMessage, 'ack')}
                  onNak={(nextMessage) => void handleAckAction(nextMessage, 'nak')}
                  onTerm={(nextMessage) => void handleAckAction(nextMessage, 'term')}
                />
                <div
                  className="message-main-splitter"
                  onMouseDown={handleMessageSplitDragStart}
                  role="separator"
                  aria-orientation="horizontal"
                      aria-label="Resize message and publish panels"
                >
                  <span className="message-main-splitter-handle" />
                </div>
                <PublishForm
                  connectionId={selectedConnectionId}
                  disabled={!activeConnection.connected}
                  onPublish={handlePublish}
                  variant="composer"
                  preferredSubject={messageSubjectFilter}
                />
              </div>
            </div>
          </div>
        )
      case 'request':
        return (
          <div className="workspace-grid workspace-grid-request">
            <div className="workspace-column workspace-column-narrow">
              <RequestPanel
                disabled={!activeConnection.connected}
                recentRequests={recentRequests}
                onRequest={handleRequest}
              />
            </div>
            <div className="workspace-column workspace-column-fluid">
              <RequestComparePanel messages={connectionMessages} selectedMessage={selectedHistoryMessage} />
            </div>
          </div>
        )
      case 'history':
        return (
          <MessageHistory
            messages={connectionMessages}
            onReply={(nextMessage) => {
              setReplyTarget(nextMessage)
              setReplyOpen(true)
            }}
            onReplayRequest={(nextMessage) => void handleReplayRequest(nextMessage)}
            onRepublish={(nextMessage) => {
              setRepublishTarget(nextMessage)
              setRepublishOpen(true)
            }}
            onAck={(nextMessage) => void handleAckAction(nextMessage, 'ack')}
            onNak={(nextMessage) => void handleAckAction(nextMessage, 'nak')}
            onTerm={(nextMessage) => void handleAckAction(nextMessage, 'term')}
            onSelectMessage={setSelectedHistoryMessage}
          />
        )
      case 'jetstream':
        return (
          <JetStreamOverview
            loading={streamLoading}
            streams={streams}
            consumers={consumers}
            selectedStream={selectedStream}
            onSelectStream={(streamName) => void handleSelectStream(streamName)}
            onSaveStream={handleSaveStream}
            onDeleteStream={handleDeleteStream}
            onSaveConsumer={handleSaveConsumer}
            onDeleteConsumer={handleDeleteConsumer}
            onFetchConsumer={handleFetchConsumer}
            connectionId={selectedConnectionId}
          />
        )
      default:
        return null
    }
  }

  const showConnectionSider = navKey === 'connections' || navKey === 'newConnection'
  const renderBrandEmptyState = ({
    title,
    description,
    compact = false,
  }: {
    title: string
    description: string
    compact?: boolean
  }) => (
    <div className={`brand-empty-state ${compact ? 'brand-empty-state-compact' : ''}`}>
      <div className="brand-empty-card">
        <div className="brand-empty-graphic">
          <img src={natsxMark} alt={appName} className="brand-empty-mark" />
        </div>
        <Typography.Title level={compact ? 4 : 3} className="brand-empty-title">
          {title}
        </Typography.Title>
        <Typography.Paragraph className="brand-empty-description">{description}</Typography.Paragraph>
        <div className="brand-empty-meta">
          <Tag className="settings-highlight-tag">{appName}</Tag>
          <Tag className="settings-highlight-tag">NATS / JetStream</Tag>
          <Tag className="settings-highlight-tag">{`v${appVersion}`}</Tag>
        </div>
      </div>
    </div>
  )

  const renderRequestLabPage = () => (
    <div className="page-shell">
      <div className="page-toolbar">
        <div>
          <Typography.Text className="panel-section-eyebrow">Request Lab</Typography.Text>
          <Typography.Title level={2} className="page-title">
            Request / Reply
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('workspace.requestLabDescription')}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            size="large"
            className="page-select"
            value={selectedConnectionId}
            options={connectionOptions}
            onChange={setSelectedConnectionId}
            placeholder={t('workspace.chooseConnection')}
          />
          {activeConnection?.connected ? (
            <Button danger icon={<PoweroffOutlined />} onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={handleConnect} disabled={!activeConnection}>
              Connect
            </Button>
          )}
        </Space>
      </div>

      {!activeConnection ? (
        renderBrandEmptyState({
          title: t('workspace.requestLabEmptyTitle'),
          description: t('workspace.requestLabEmptyDescription'),
        })
      ) : (
        <div className="workspace-grid workspace-grid-request">
          <div className="workspace-column workspace-column-narrow">
            <RequestPanel
              disabled={!activeConnection.connected}
              recentRequests={recentRequests}
              onRequest={handleRequest}
            />
          </div>
          <div className="workspace-column workspace-column-fluid">
            <RequestComparePanel messages={connectionMessages} selectedMessage={selectedHistoryMessage} />
          </div>
        </div>
      )}
    </div>
  )

  const renderViewerPage = () => (
    <div className="page-shell">
      <div className="page-toolbar">
        <div>
          <Typography.Text className="panel-section-eyebrow">Viewer</Typography.Text>
          <Typography.Title level={2} className="page-title">
            {t('workspace.viewerTitle')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('workspace.viewerDescription')}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            size="large"
            className="page-select"
            value={selectedConnectionId}
            options={connectionOptions}
            onChange={setSelectedConnectionId}
            placeholder={t('workspace.chooseConnection')}
          />
          <Select
            size="large"
            className="page-select page-select-wide"
            value={selectedHistoryMessage?.id}
            options={viewerCandidates.map((item) => ({
              value: item.id,
              label: `${new Date(item.receivedAt).toLocaleTimeString()} · ${item.direction.toUpperCase()} · ${item.subject}`,
            }))}
            onChange={(value) => setSelectedHistoryMessage(viewerCandidates.find((item) => item.id === value))}
            placeholder={t('workspace.chooseMessage')}
          />
        </Space>
      </div>

      <div className="viewer-switcher">
        <Tag color="blue">{t('workspace.viewerMessages', { count: connectionMessages.length })}</Tag>
        <Tag color="purple">{t('workspace.viewerRequests', { count: connectionMessages.filter((item) => item.kind === 'request' || item.kind === 'response').length })}</Tag>
        <Tag color="cyan">{t('workspace.viewerDiff')}</Tag>
      </div>

      <div className="viewer-page-grid">
        <MessageWorkbench
          messages={viewerCandidates}
          selectedMessage={selectedHistoryMessage}
          onReply={(nextMessage) => {
            setReplyTarget(nextMessage)
            setReplyOpen(true)
          }}
          onReplayRequest={(nextMessage) => void handleReplayRequest(nextMessage)}
          onRepublish={(nextMessage) => {
            setRepublishTarget(nextMessage)
            setRepublishOpen(true)
          }}
          onAck={(nextMessage) => void handleAckAction(nextMessage, 'ack')}
          onNak={(nextMessage) => void handleAckAction(nextMessage, 'nak')}
          onTerm={(nextMessage) => void handleAckAction(nextMessage, 'term')}
          onSelectMessage={setSelectedHistoryMessage}
        />
        <RequestComparePanel messages={connectionMessages} selectedMessage={selectedHistoryMessage} />
      </div>
    </div>
  )

  const renderLogsPage = () => (
    <div className="page-shell">
      <div className="page-toolbar">
        <div>
          <Typography.Text className="panel-section-eyebrow">Logs</Typography.Text>
          <Typography.Title level={2} className="page-title">
            Log
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('workspace.logsDescription')}
          </Typography.Paragraph>
        </div>
        <Select
          size="large"
          value={logLevelFilter}
          options={[
            { value: 'ALL', label: 'ALL' },
            { value: 'INFO', label: 'INFO' },
            { value: 'DEBUG', label: 'DEBUG' },
            { value: 'ERROR', label: 'ERROR' },
          ]}
          className="page-select"
          onChange={(value) => setLogLevelFilter(value as 'ALL' | 'INFO' | 'DEBUG' | 'ERROR')}
        />
      </div>

      <Card className="page-card log-page-card">
        <div className="log-page-content">
          {filteredLogEntries.length === 0 ? (
            renderBrandEmptyState({
              title: t('workspace.noMatchingLogsTitle'),
              description: t('workspace.noMatchingLogsDescription'),
              compact: true,
            })
          ) : (
            <div className="log-page-grid">
              <div className="log-list-panel">
                {filteredLogEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`log-line ${selectedLogEntry?.message.id === entry.message.id ? 'log-line-active' : ''}`}
                    onClick={() => setSelectedLogMessageId(entry.message.id)}
                  >
                    <span className="log-line-number">{entry.line}</span>
                    <span className={`log-line-level log-line-level-${entry.level.toLowerCase()}`}>[{entry.level}]</span>
                    <span className="log-line-text">{entry.text}</span>
                  </button>
                ))}
              </div>

              <Card className="log-detail-card" title="Log Detail">
                {selectedLogEntry ? (
                  <>
                    <Space wrap className="log-detail-tags">
                      <Tag color={selectedLogEntry.level === 'ERROR' ? 'error' : selectedLogEntry.level === 'DEBUG' ? 'purple' : 'blue'}>
                        {selectedLogEntry.level}
                      </Tag>
                      <Tag>{selectedLogEntry.message.kind}</Tag>
                      <Tag>{selectedLogEntry.message.direction}</Tag>
                      {selectedLogEntry.message.jetStream ? <Tag color="cyan">JetStream</Tag> : null}
                    </Space>

                    <Descriptions bordered size="small" column={1}>
                      <Descriptions.Item label="Time">{selectedLogEntry.time}</Descriptions.Item>
                      <Descriptions.Item label="Connection">{selectedLogEntry.connectionName}</Descriptions.Item>
                      <Descriptions.Item label="Summary">{selectedLogEntry.summary}</Descriptions.Item>
                      <Descriptions.Item label="Subject">{selectedLogEntry.message.subject}</Descriptions.Item>
                      <Descriptions.Item label="Reply">{selectedLogEntry.message.reply ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="Correlation ID">{selectedLogEntry.message.correlationId ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="Headers">
                        <pre className="message-pre history-pre">{formatHeaders(selectedLogEntry.message.headers)}</pre>
                      </Descriptions.Item>
                      <Descriptions.Item
                        label={
                          <Space wrap>
                            <span>Payload</span>
                            <Select
                              size="small"
                              value={logPayloadViewMode}
                              style={{ width: 140 }}
                              options={payloadModeOptions}
                              onChange={(value) => setLogPayloadViewMode(value)}
                            />
                          </Space>
                        }
                      >
                        <pre className="message-pre history-pre">{selectedLogPayload || '-'}</pre>
                      </Descriptions.Item>
                    </Descriptions>
                  </>
                ) : null}
              </Card>
            </div>
          )}
        </div>
      </Card>
    </div>
  )

  const renderSettingsPage = () => (
    <div className="page-shell">
      <div className="page-toolbar">
        <div>
          <Typography.Text className="panel-section-eyebrow">{t('settings.eyebrow')}</Typography.Text>
          <Typography.Title level={2} className="page-title">
            {t('settings.title')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('settings.description')}
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="page-card settings-hero-card">
        <div className="settings-hero-content">
          <div className="settings-brand-block">
            <div className="settings-brand-mark">
              <img src={natsxMark} alt={appName} className="settings-brand-mark-image" />
            </div>
            <div>
              <Typography.Title level={3} className="settings-brand-title">
                {t('settings.brandTitle')}
              </Typography.Title>
              <Typography.Paragraph className="settings-brand-copy">
                {t('settings.brandCopy')}
              </Typography.Paragraph>
            </div>
          </div>
          <Space wrap>
            <Tag className="about-version-tag">{`v${appVersion}`}</Tag>
            <Tag className="settings-highlight-tag">
              {themeMode === 'system'
                ? `${t('settings.followSystem')} · ${resolvedTheme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}`
                : resolvedTheme === 'dark'
                  ? t('settings.darkTheme')
                  : t('settings.lightTheme')}
            </Tag>
            <Tag className="settings-highlight-tag">{t('settings.desktopClient')}</Tag>
          </Space>
        </div>
      </Card>

      <Card className="page-card settings-page-card">
        <div className="settings-group-title">{t('settings.general')}</div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.autoCheckUpdate')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.autoCheckUpdateDesc')}</Typography.Paragraph>
          </div>
          <Switch checked={autoCheckUpdate} onChange={setAutoCheckUpdate} />
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.autoResubscribe')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.autoResubscribeDesc')}</Typography.Paragraph>
          </div>
          <Switch checked={autoResubscribe} onChange={setAutoResubscribe} />
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.multiSubjectSubscribe')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.multiSubjectSubscribeDesc')}</Typography.Paragraph>
          </div>
          <Switch checked={multiSubjectSubscribe} onChange={setMultiSubjectSubscribe} />
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.maxReconnectTimes')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.maxReconnectTimesDesc')}</Typography.Paragraph>
          </div>
          <InputNumber min={1} max={99} value={maxReconnectTimes} onChange={(value) => setMaxReconnectTimes(Number(value ?? 10))} />
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.maxPayloadSize')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.maxPayloadSizeDesc')}</Typography.Paragraph>
          </div>
          <div className="settings-row-inline">
            <Slider min={64} max={2048} step={64} value={maxPayloadSize} onChange={setMaxPayloadSize} style={{ width: 220 }} />
            <Tag>{maxPayloadSize} KB</Tag>
          </div>
        </div>

        <div className="settings-group-title settings-group-spaced">{t('settings.updates')}</div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.currentVersion')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.currentVersionDesc')}</Typography.Paragraph>
          </div>
          <div className="settings-row-inline">
            <Tag>{`v${appVersion}`}</Tag>
            <Tag>{updateInfo?.platform ?? 'windows-amd64'}</Tag>
            {updateInfo ? (
              <Tag color={!updateInfo.releaseFound ? 'warning' : updateInfo.hasUpdate ? 'success' : 'default'}>
                {!updateInfo.releaseFound ? t('settings.noRelease') : updateInfo.hasUpdate ? t('messages.updateChecked', { version: updateInfo.latestVersion }) : t('messages.latest')}
              </Tag>
            ) : (
              <Tag>{t('settings.checkUpdate')}</Tag>
            )}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.releaseAsset')}</Typography.Text>
            <Typography.Paragraph type="secondary">
              {updateInfo?.assetName
                ? `${t('workspace.matchedPlatformAsset', { name: updateInfo.assetName })}${
                    updateInfo.assetSha256 ? ` · SHA256 ${ellipsisMiddle(updateInfo.assetSha256, 24)}` : ''
                  }`
                : t('settings.releaseAssetNone')}
            </Typography.Paragraph>
          </div>
          <div className="settings-row-inline">
            <Button icon={<ReloadOutlined />} loading={checkingUpdates} onClick={() => void handleCheckForUpdates()}>
              {t('settings.checkUpdate')}
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              loading={downloadUpdateLoading}
              disabled={!updateInfo?.releaseFound || !updateInfo?.hasUpdate || !updateInfo?.hasPlatformAsset || !updateInfo?.assetSha256}
              onClick={() => void handleDownloadUpdatePackage()}
            >
              {t('settings.downloadPackage')}
            </Button>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={manualUpgradeLoading}
              disabled={!updateInfo?.releaseFound || !updateInfo?.hasUpdate}
              onClick={() => void handleManualUpgrade()}
            >
              {t('settings.manualUpgrade')}
            </Button>
          </div>
        </div>
        {downloadedUpdate ? (
          <div className="settings-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text strong>{t('settings.downloadedPackage')}</Typography.Text>
              <Typography.Paragraph type="secondary">
                {downloadedUpdate.assetName} · {formatFileSize(downloadedUpdate.bytes)} · {t('workspace.publishedAt', { time: new Date(downloadedUpdate.downloadedAt).toLocaleString() })}
              </Typography.Paragraph>
              <div className="settings-row-inline" style={{ marginBottom: 6 }}>
                <Tag color={downloadedUpdate.verified ? 'success' : 'warning'}>
                  {downloadedUpdate.verified ? t('settings.sha256Verified') : t('settings.sha256Pending')}
                </Tag>
                {downloadedUpdate.verifiedSha256 ? (
                  <Tooltip title={downloadedUpdate.verifiedSha256}>
                    <Typography.Text type="secondary">{`SHA256 ${ellipsisMiddle(downloadedUpdate.verifiedSha256, 24)}`}</Typography.Text>
                  </Tooltip>
                ) : null}
              </div>
              <Tooltip title={downloadedUpdate.path}>
                <Typography.Text type="secondary">{ellipsisMiddle(downloadedUpdate.path)}</Typography.Text>
              </Tooltip>
            </div>
            <div className="settings-row-inline">
              <Tag>{`v${downloadedUpdate.latestVersion}`}</Tag>
              <Button icon={<FolderOpenOutlined />} onClick={() => void handleRevealDownloadedUpdate()}>
                {t('settings.openFolder')}
              </Button>
              <Button type="primary" onClick={() => void handleOpenDownloadedUpdate()}>
                {t('settings.runInstaller')}
              </Button>
            </div>
          </div>
        ) : null}
        {updateDownloadProgress ? (
          <div className="settings-row">
            <div style={{ flex: 1 }}>
              <Typography.Text strong>{t('settings.downloadProgress')}</Typography.Text>
              <Typography.Paragraph type="secondary">
                {updateDownloadProgress.status === 'completed'
                  ? t('workspace.updateDownloadCompleted')
                  : updateDownloadProgress.status === 'verifying'
                    ? t('workspace.updateVerifying')
                  : updateDownloadProgress.status === 'error'
                    ? updateDownloadProgress.errorMessage || t('messages.downloadFailed')
                    : updateDownloadProgress.assetName || t('workspace.updateDownloading')}
              </Typography.Paragraph>
              <Progress
                percent={
                  updateDownloadProgress.status === 'completed'
                    ? 100
                    : Math.max(0, Math.min(100, Math.round(updateDownloadProgress.progressPercent || 0)))
                }
                status={updateDownloadProgress.status === 'error' ? 'exception' : undefined}
              />
            </div>
            <div className="settings-row-inline">
              <Tag>{`${t('settings.downloaded')} ${formatFileSize(updateDownloadProgress.downloadedBytes)}`}</Tag>
              {updateDownloadProgress.totalBytes > 0 ? (
                <Tag>{`${t('settings.total')} ${formatFileSize(updateDownloadProgress.totalBytes)}`}</Tag>
              ) : (
                <Tag>{t('settings.sizeUnknown')}</Tag>
              )}
            </div>
          </div>
        ) : null}
        {updateInfo ? (
          <div className="settings-row">
            <div>
              <Typography.Text strong>{t('settings.latestRelease')}</Typography.Text>
              <Typography.Paragraph type="secondary">
                {updateInfo.publishedAt ? `Published: ${new Date(updateInfo.publishedAt).toLocaleString()}` : t('settings.latestReleaseReady')}
              </Typography.Paragraph>
            </div>
            <div className="settings-row-inline">
              <Tag>{`v${updateInfo.latestVersion || appVersion}`}</Tag>
              {!updateInfo.releaseFound ? (
                <Tag color="warning">{t('settings.noRelease')}</Tag>
              ) : updateInfo.hasPlatformAsset ? (
                <Tag color="blue">{t('settings.hasPlatformAsset')}</Tag>
              ) : (
                <Tag color="warning">{t('settings.noPlatformAsset')}</Tag>
              )}
              {updateInfo.assetSha256 ? (
                <Tag color="success">{t('settings.sha256Ready')}</Tag>
              ) : updateInfo.hasPlatformAsset ? (
                <Tag color="warning">{t('settings.sha256Missing')}</Tag>
              ) : null}
              {updateInfo.releaseUrl ? (
                <Button href={updateInfo.releaseUrl} target="_blank">
                  {t('settings.viewRelease')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="settings-group-title settings-group-spaced">{t('settings.logs')}</div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.maxLogRetentionSize')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.maxLogRetentionSizeDesc')}</Typography.Paragraph>
          </div>
          <div className="settings-row-inline">
            <InputNumber
              min={10}
              max={10240}
              step={10}
              value={logRetentionMaxSizeMb}
              onChange={(value) => setLogRetentionMaxSizeMb(Math.max(10, Number(value ?? defaultLogRetentionMaxSizeMb)))}
            />
            <Tag>{logRetentionMaxSizeMb} MB</Tag>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.maxLogEntries')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.maxLogEntriesDesc')}</Typography.Paragraph>
          </div>
          <div className="settings-row-inline">
            <InputNumber
              min={100}
              max={100000}
              step={100}
              value={logRetentionMaxEntries}
              onChange={(value) => setLogRetentionMaxEntries(Math.max(100, Number(value ?? defaultLogRetentionMaxEntries)))}
            />
            <Tag>{t('workspace.logEntries', { count: logRetentionMaxEntries })}</Tag>
          </div>
        </div>

        <div className="settings-group-title settings-group-spaced">{t('settings.appearance')}</div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.language')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.languageDesc')}</Typography.Paragraph>
          </div>
          <Select
            value={language}
            onChange={(value) => setLanguage(value)}
            options={supportedLanguages.map((item) => ({
              value: item.code,
              label: `${item.nativeLabel} · ${item.label}`,
            }))}
            style={{ width: 220 }}
          />
        </div>
        <div className="settings-row">
          <div>
            <Typography.Text strong>{t('settings.theme')}</Typography.Text>
            <Typography.Paragraph type="secondary">{t('settings.themeDesc')}</Typography.Paragraph>
          </div>
          <Select
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
              { value: 'system', label: t('settings.themeSystem') },
            ]}
            style={{ width: 180 }}
          />
        </div>
      </Card>
    </div>
  )

  const renderAboutPage = () => (
    <div className="page-shell about-page">
      <div className="page-toolbar">
        <div>
          <Typography.Text className="panel-section-eyebrow">{t('about.eyebrow')}</Typography.Text>
          <Typography.Title level={2} className="page-title">
            {t('about.title')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('about.description')}
          </Typography.Paragraph>
        </div>
        <Tag className="about-version-tag">{`v${appVersion}`}</Tag>
      </div>

      <div className="about-grid">
        <Card className="page-card about-card about-card-hero">
          <div className="about-logo-wrap">
            <img src={natsxLogo} alt={appName} className="about-logo-image" />
          </div>
          <Typography.Paragraph className="about-hero-copy">
            {t('about.hero')}
          </Typography.Paragraph>
          <div className="about-feature-chips">
            <Tag className="settings-highlight-tag">Go + Wails</Tag>
            <Tag className="settings-highlight-tag">React + Ant Design</Tag>
            <Tag className="settings-highlight-tag">NATS / JetStream</Tag>
          </div>
          <Space wrap>
            <Button href="https://github.com/punk-one/NatsX" target="_blank">
              GitHub
            </Button>
            <Button href="https://github.com/punk-one/NatsX" target="_blank" icon={<GlobalOutlined />}>
              {t('about.clientHome')}
            </Button>
          </Space>
        </Card>

        <Card className="page-card about-card">
          <Typography.Title level={4}>{t('about.projectInfo')}</Typography.Title>
          <div className="about-info-item">
            <span>{t('about.version')}</span>
            <strong>{appVersion}</strong>
          </div>
          <div className="about-info-item">
            <span>{t('about.license')}</span>
            <strong>{appLicense}</strong>
          </div>
          <div className="about-info-item">
            <span>{t('about.author')}</span>
            <strong>{appAuthor}</strong>
          </div>
          <div className="about-info-item">
            <span>{t('about.brand')}</span>
            <strong>{t('about.brandValue')}</strong>
          </div>
        </Card>
      </div>
    </div>
  )

  const renderPageContent = () => {
    switch (navKey) {
      case 'connections':
        return !activeConnection ? (
          renderBrandEmptyState({
            title: t('workspace.startTitle'),
            description: t('workspace.startDescription'),
          })
        ) : (
          renderWorkspace()
        )
      case 'newConnection':
        return (
          <ConnectionEditorPage
            onBack={() => setNavKey('connections')}
            onSubmit={async (input) => {
              await handleSaveConnection(input)
              setNavKey('connections')
            }}
          />
        )
      case 'viewer':
        return renderViewerPage()
      case 'requestLab':
        return renderRequestLabPage()
      case 'logs':
        return renderLogsPage()
      case 'settings':
        return renderSettingsPage()
      case 'about':
        return renderAboutPage()
      default:
        return null
    }
  }

  return (
    <>
      <div className={`desktop-shell ${windowState.maximised ? 'desktop-shell-maximised' : ''}`}>
        <div className="app-titlebar" onDoubleClick={() => void handleWindowToggleMaximise()}>
          <div className="titlebar-left">
            <div className="titlebar-logo">
              <img src={natsxMark} alt="NatsX" className="titlebar-logo-image" />
            </div>
            <div className="titlebar-meta titlebar-meta-inline">
              <Typography.Text className="titlebar-appname">NatsX</Typography.Text>
              <Typography.Text className="titlebar-divider">-</Typography.Text>
              <Typography.Text className="titlebar-subtitle">
                {t('app.subtitle')}
              </Typography.Text>
            </div>
          </div>
          <div className="titlebar-actions">
            <Button type="text" className="window-control-button" icon={<MinusOutlined />} onClick={() => void handleWindowMinimise()} />
            <Button
              type="text"
              className="window-control-button"
              icon={windowState.maximised ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => void handleWindowToggleMaximise()}
            />
            <Button type="text" danger className="window-control-button" icon={<CloseOutlined />} onClick={() => void handleWindowClose()} />
          </div>
        </div>

        <Layout className="natsx-shell">
          <Sider width={64} className="rail-sider">
            <div className="rail-brand">
              <img src={natsxMark} alt="NatsX" className="rail-brand-image" />
            </div>
            <div className="rail-nav">
              {primaryNavItems.map((item) => (
                <Tooltip key={item.key} placement="right" title={item.label}>
                  <Button
                    type="text"
                    className={`rail-button ${navKey === item.key ? 'rail-button-active' : ''}`}
                    icon={item.icon}
                    onClick={() => setNavKey(item.key)}
                  />
                </Tooltip>
              ))}
            </div>
            <div className="rail-footer-nav">
              <Dropdown
                trigger={['click']}
                menu={{
                  items: languageMenuItems,
                  onClick: ({ key }) => setLanguage(key as typeof language),
                }}
                overlayClassName="workspace-more-menu-overlay"
              >
                <Tooltip placement="right" title={t('app.language')}>
                  <Button type="text" className="rail-button" icon={<GlobalOutlined />} />
                </Tooltip>
              </Dropdown>
              {footerNavItems.map((item) => (
                <Tooltip key={item.key} placement="right" title={item.label}>
                  <Button
                    type="text"
                    className={`rail-button ${navKey === item.key ? 'rail-button-active' : ''}`}
                    icon={item.icon}
                    onClick={() => setNavKey(item.key)}
                  />
                </Tooltip>
              ))}
            </div>
          </Sider>

          {showConnectionSider ? (
            <Sider
              width={324}
              collapsedWidth={0}
              collapsed={connectionSidebarCollapsed}
              trigger={null}
              className={`connection-sider ${connectionSidebarCollapsed ? 'connection-sider-collapsed' : ''}`}
            >
              <div className="connection-sider-header">
                <div className="connection-sider-heading">
                  <div className="connection-sider-title-row">
                    <Typography.Title level={2} className="connection-sider-title">
                      Connections
                    </Typography.Title>
                    <Tag className="connection-sider-count">{snapshot.connections.length}</Tag>
                  </div>
                </div>
                <Space size={8}>
                  <Button
                    className="connection-sider-action"
                    icon={<PlusOutlined />}
                    onClick={() => setNavKey('newConnection')}
                  />
                  <ConnectionTransferActions
                    variant="popover"
                    trigger={<Button className="connection-sider-action" icon={<EllipsisOutlined />} />}
                    onExport={handleExportConnections}
                    onExportToFile={handleExportConnectionsToFile}
                    onImport={handleImportConnections}
                    onImportFromFile={handleImportConnectionsFromFile}
                  />
                  <Button
                    className="connection-sider-action"
                    icon={<MenuFoldOutlined />}
                    onClick={() => setConnectionSidebarCollapsed(true)}
                  />
                </Space>
              </div>

              <div className="connection-sider-body">
                <div className="connection-list-wrap">
                  {snapshot.connections.length === 0 ? (
                    <div className="connection-list-empty">
                      <Typography.Text type="secondary">{t('workspace.noConnections')}</Typography.Text>
                    </div>
                  ) : (
                    groupedConnections.map(({ group, connections: groupConns }) => (
                      <div key={group} className="connection-group">
                        <div className="connection-group-header">
                          <Typography.Text className="connection-group-label">{group}</Typography.Text>
                          <Typography.Text type="secondary" className="connection-group-count">
                            {groupConns.filter((c) => c.connected).length}/{groupConns.length}
                          </Typography.Text>
                        </div>
                        <List
                          className="connection-list"
                          dataSource={groupConns}
                          renderItem={(connection) => (
                            <List.Item
                              className={`connection-item ${connection.id === selectedConnectionId ? 'connection-item-active' : ''}`}
                              onClick={() => {
                                setSelectedConnectionId(connection.id)
                                setNavKey('connections')
                              }}
                              actions={[
                                <Button
                                  key="edit"
                                  type="text"
                                  icon={<EditOutlined />}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setEditingConnection(connection)
                                    setEditorOpen(true)
                                  }}
                                />,
                                <Popconfirm
                                  key="delete"
                                  title={t('workspace.deleteConnectionConfirm')}
                                  okText={t('jetstream.delete')}
                                  cancelText={t('jetstream.cancel')}
                                  onConfirm={(event) => {
                                    event?.stopPropagation()
                                    void handleDeleteConnection(connection.id)
                                  }}
                                >
                                  <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                </Popconfirm>,
                              ]}
                            >
                              <List.Item.Meta
                                title={
                                  <div className="connection-item-title">
                                    <Space size={8}>
                                      <span className={`connection-status-dot ${connection.connected ? 'connection-status-dot-online' : reconnectingIds.has(connection.id) ? 'connection-status-dot-reconnecting' : ''}`} />
                                      <Typography.Text strong className="connection-item-name">
                                        {connection.name}
                                      </Typography.Text>
                                    </Space>
                                  </div>
                                }
                                description={
                                  <Space direction="vertical" size={6}>
                                    <Typography.Text type="secondary" className="connection-item-url">
                                      {connection.url.replace(/^nats:\/\//, '')}
                                    </Typography.Text>
                                    <div className="connection-item-subline connection-item-tags">
                                      <Tag color="blue">{authModeLabel(connection.authMode, t)}</Tag>
                                      {connection.certFile || connection.caFile ? <Tag color="cyan">TLS</Tag> : null}
                                      {connection.connected ? <Tag color="success">Online</Tag> : null}
                                    </div>
                                    {connection.description ? (
                                      <Typography.Text type="secondary" className="connection-item-description">
                                        {connection.description}
                                      </Typography.Text>
                                    ) : null}
                                  </Space>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Sider>
          ) : null}

          <Layout className="workspace-layout">
            {navKey === 'connections' ? (
              <Header className="workspace-header">
                <div className="workspace-header-shell">
                  <div className="workspace-header-row">
                    <div className="workspace-header-main">
                      <Button
                        className="workspace-strip-icon workspace-sidebar-toggle"
                        icon={connectionSidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setConnectionSidebarCollapsed((current) => !current)}
                      />
                      <div className="workspace-connection-strip">
                        <Select
                          size="large"
                          className="workspace-connection-select"
                          value={selectedConnectionId}
                          options={connectionOptions}
                          onChange={setSelectedConnectionId}
                          placeholder={t('workspace.chooseConnection')}
                        />
                        <Tag color={activeConnection?.connected ? 'success' : 'default'} className="workspace-count-tag">
                          {t('workspace.messageCount', { count: connectionMessages.length })}
                        </Tag>
                      </div>
                    </div>

                    <Space wrap className="workspace-action-group">
                      {activeConnection?.connected ? (
                        <Button
                          danger
                          className="workspace-strip-icon workspace-strip-danger"
                          icon={<PoweroffOutlined />}
                          onClick={handleDisconnect}
                        />
                      ) : (
                        <Button
                          type="primary"
                          className="workspace-strip-icon"
                          icon={<SendOutlined />}
                          onClick={handleConnect}
                          disabled={!activeConnection}
                        />
                      )}
                      <Button
                        className="workspace-strip-icon"
                        icon={<EditOutlined />}
                        onClick={() => {
                          if (!activeConnection || activeConnection.connected) {
                            return
                          }
                          setEditingConnection(activeConnection)
                          setEditorOpen(true)
                        }}
                        disabled={!activeConnection || Boolean(activeConnection.connected)}
                      />
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: messageMoreMenuItems,
                          onClick: handleMessageMoreMenuClick,
                        }}
                        overlayClassName="workspace-more-menu-overlay"
                      >
                        <Button className="workspace-strip-icon" icon={<EllipsisOutlined />} disabled={!activeConnection} />
                      </Dropdown>
                    </Space>
                  </div>

                  {messageSearchOpen && workspaceKey === 'messages' ? (
                    <div className="workspace-message-searchbar">
                      <Input
                        allowClear
                        value={messageSearchDraftTopic}
                        className="workspace-message-search-input"
                        placeholder="Please input topic"
                        onChange={(event) => setMessageSearchDraftTopic(event.target.value)}
                        onPressEnter={handleApplyMessageSearch}
                      />
                      <Input
                        allowClear
                        value={messageSearchDraftPayload}
                        className="workspace-message-search-input"
                        placeholder="Please input message"
                        onChange={(event) => setMessageSearchDraftPayload(event.target.value)}
                        onPressEnter={handleApplyMessageSearch}
                      />
                      <Button className="workspace-strip-icon" icon={<FileSearchOutlined />} onClick={handleApplyMessageSearch} />
                      <Button className="workspace-strip-icon" icon={<CloseOutlined />} onClick={handleCloseMessageSearch} />
                    </div>
                  ) : null}
                </div>
              </Header>
            ) : null}

            <Content
              className={`workspace-content ${navKey !== 'connections' ? 'workspace-content-page' : ''} ${
                navKey === 'connections' && workspaceKey === 'messages' ? 'workspace-content-message' : ''
              }`}
            >
              {renderPageContent()}
            </Content>
          </Layout>
        </Layout>
      </div>

      <ConnectionEditor
        open={editorOpen}
        initialValue={editingConnection}
        onCancel={() => {
          setEditorOpen(false)
          setEditingConnection(undefined)
        }}
        onSubmit={handleSaveConnection}
      />

      <ReplyComposer
        open={replyOpen}
        message={replyTarget}
        connectionId={selectedConnectionId}
        onCancel={() => {
          setReplyOpen(false)
          setReplyTarget(undefined)
        }}
        onSubmit={handleReply}
      />

      <RepublishComposer
        open={republishOpen}
        message={republishTarget}
        onCancel={() => {
          setRepublishOpen(false)
          setRepublishTarget(undefined)
        }}
        onSubmit={handleRepublishMessage}
      />
    </>
  )
}

