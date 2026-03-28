import {
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  ExclamationCircleFilled,
  LeftOutlined,
  PauseCircleOutlined,
  RightOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Card, Dropdown, Input, InputNumber, Modal, Select, Switch, Tooltip, Typography, type MenuProps } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { PayloadMode } from '../utils/payload'
import {
  formatJsonPayload,
  payloadModeOptions,
  preparePayloadForTransport,
  supportsStructuredFormatting,
} from '../utils/payload'
import { parseHeaderText } from '../utils/nats'

interface PublishFormProps {
  disabled: boolean
  connectionId?: string
  variant?: 'panel' | 'composer'
  preferredSubject?: string
  onPublish: (
    payload: {
      subject: string
      payload: string
      payloadBase64?: string
      payloadEncoding: PayloadMode
      useJetStream: boolean
      headers?: Record<string, string>
    },
    options?: {
      silent?: boolean
    },
  ) => Promise<void>
}

interface PublishValues {
  subject: string
  payload: string
  payloadMode: PayloadMode
}

interface PublishHistoryEntry {
  subject: string
  payload: string
  payloadMode: PayloadMode
}

const defaultValues: PublishValues = {
  subject: 'orders.created',
  payload: '{\n  "id": "A-1001",\n  "status": "created"\n}',
  payloadMode: 'json',
}

const maxHistorySize = 10

function isSameHistoryEntry(left: PublishHistoryEntry, right: PublishHistoryEntry) {
  return left.subject === right.subject && left.payload === right.payload && left.payloadMode === right.payloadMode
}

export function PublishForm({
  disabled,
  connectionId,
  onPublish,
  variant = 'panel',
  preferredSubject,
}: PublishFormProps) {
  const { message } = AntdApp.useApp()
  const { t } = useI18n()
  const isComposer = variant === 'composer'
  const [subject, setSubject] = useState(defaultValues.subject)
  const [payload, setPayload] = useState(defaultValues.payload)
  const [payloadMode, setPayloadMode] = useState<PayloadMode>(defaultValues.payloadMode)
  const [useJetStream, setUseJetStream] = useState(false)
  const [headerText, setHeaderText] = useState('')
  const [headerDraftText, setHeaderDraftText] = useState('')
  const [headersModalOpen, setHeadersModalOpen] = useState(false)
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>()
  const [timedMessageOpen, setTimedMessageOpen] = useState(false)
  const [clearRetainedOpen, setClearRetainedOpen] = useState(false)
  const [timedFrequency, setTimedFrequency] = useState(4)
  const [timedMessageActive, setTimedMessageActive] = useState(false)
  const timedPublishRef = useRef<number>()

  const stopTimedPublish = () => {
    if (timedPublishRef.current) {
      window.clearInterval(timedPublishRef.current)
      timedPublishRef.current = undefined
    }
    setTimedMessageActive(false)
  }

  useEffect(() => {
    const nextSubject = preferredSubject?.trim()
    if (!nextSubject || nextSubject === subject) {
      return
    }
    setSubject(nextSubject)
  }, [preferredSubject, subject])

  useEffect(() => () => stopTimedPublish(), [])

  useEffect(() => {
    stopTimedPublish()
  }, [connectionId, disabled])

  const historyLabel = useMemo(() => {
    if (publishHistory.length === 0) {
      return '0/10'
    }
    if (historyIndex === undefined) {
      return `1/${publishHistory.length}`
    }
    return `${historyIndex + 1}/${publishHistory.length}`
  }, [historyIndex, publishHistory.length])

  const recentTopics = useMemo(
    () =>
      publishHistory.reduce<string[]>((subjects, item) => {
        if (!subjects.includes(item.subject)) {
          subjects.push(item.subject)
        }
        return subjects
      }, []),
    [publishHistory],
  )

  const recentTopicItems: MenuProps['items'] = recentTopics.map((item) => ({
    key: item,
    label: item,
  }))

  const headerSummary = useMemo(() => {
    const normalizedHeaderLines = headerText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (normalizedHeaderLines.length === 0) {
      return ''
    }

    const [firstLine, ...restLines] = normalizedHeaderLines
    return restLines.length > 0 ? `${firstLine} +${restLines.length}` : firstLine
  }, [headerText])

  const publishMoreMenuItems: MenuProps['items'] = [
    {
      key: 'clear-retained',
      icon: <DeleteOutlined />,
      label: t('publish.clearRetainedMessage'),
    },
    {
      key: 'timed-message',
      icon: <ClockCircleOutlined />,
      label: t('publish.timedMessage'),
    },
  ]

  const collectValues = (): PublishValues => ({
    subject: subject.trim(),
    payload,
    payloadMode,
  })

  const commitHistoryEntry = (entry: PublishHistoryEntry) => {
    setPublishHistory((current) => {
      const deduplicated = current.filter((item) => !isSameHistoryEntry(item, entry))
      return [entry, ...deduplicated].slice(0, maxHistorySize)
    })
    setHistoryIndex(0)
  }

  const applyHistoryEntry = (entry: PublishHistoryEntry) => {
    setSubject(entry.subject)
    setPayload(entry.payload)
    setPayloadMode(entry.payloadMode)
  }

  const validateValues = (values: PublishValues) => {
    if (!values.subject) {
      message.error(t('publish.topicRequired'))
      return false
    }
    if (!values.payload.trim()) {
      message.error(t('publish.payloadRequired'))
      return false
    }
    return true
  }

  const publishValues = async (
    values: PublishValues,
    options?: {
      silent?: boolean
    },
  ) => {
    if (!validateValues(values)) {
      throw new Error('validation failed')
    }

    let preparedPayload

    try {
      preparedPayload = preparePayloadForTransport(values.payload, values.payloadMode)
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t('publish.invalidPayload', { mode: values.payloadMode.toUpperCase() })
      message.error(nextError)
      throw error
    }

    await onPublish(
      {
        subject: values.subject,
        payload: preparedPayload.payload,
        payloadBase64: preparedPayload.payloadBase64,
        payloadEncoding: preparedPayload.payloadEncoding,
        useJetStream,
        headers: parseHeaderText(headerText),
      },
      options,
    )

    const nextHistoryEntry: PublishHistoryEntry = {
      subject: values.subject,
      payload: preparedPayload.payload,
      payloadMode: values.payloadMode,
    }

    commitHistoryEntry(nextHistoryEntry)
    setPayload(preparedPayload.payload)
  }

  const handleSubmit = async () => {
    if (disabled) {
      message.error(t('publish.connectFirst'))
      return
    }
    await publishValues(collectValues())
  }

  const handleSelectOlder = () => {
    if (publishHistory.length === 0) {
      return
    }
    if (historyIndex === undefined) {
      setHistoryIndex(0)
      applyHistoryEntry(publishHistory[0])
      return
    }
    const nextIndex = Math.min(historyIndex + 1, publishHistory.length - 1)
    setHistoryIndex(nextIndex)
    applyHistoryEntry(publishHistory[nextIndex])
  }

  const handleSelectNewer = () => {
    if (publishHistory.length === 0 || historyIndex === undefined) {
      return
    }
    const nextIndex = Math.max(historyIndex - 1, 0)
    setHistoryIndex(nextIndex)
    applyHistoryEntry(publishHistory[nextIndex])
  }

  const handlePublishMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'timed-message') {
      setTimedMessageOpen(true)
      return
    }
    if (key === 'clear-retained') {
      setClearRetainedOpen(true)
    }
  }

  const handleOpenHeadersModal = () => {
    setHeaderDraftText(headerText)
    setHeadersModalOpen(true)
  }

  const handleConfirmHeadersModal = () => {
    setHeaderText(headerDraftText.trim())
    setHeadersModalOpen(false)
  }

  const handleConfirmTimedMessage = async () => {
    if (disabled) {
      message.error(t('publish.connectFirst'))
      return
    }

    const snapshot = collectValues()
    if (!validateValues(snapshot)) {
      return
    }

    stopTimedPublish()
    timedPublishRef.current = window.setInterval(() => {
      void publishValues(snapshot, { silent: true }).catch(() => undefined)
    }, Math.max(1, timedFrequency) * 1000)

    setTimedMessageActive(true)
    setTimedMessageOpen(false)
    message.success(t('publish.timedEnabled', { seconds: timedFrequency }))
  }

  const handleStopTimedMessage = () => {
    stopTimedPublish()
    message.success(t('publish.timedStopped'))
  }

  const handleConfirmClearRetained = () => {
    const nextSubject = subject.trim()
    if (nextSubject) {
      setPublishHistory((current) => current.filter((item) => item.subject !== nextSubject))
    } else {
      setPublishHistory([])
    }
    setHistoryIndex(undefined)
    setPayload('')
    setClearRetainedOpen(false)
    message.success(nextSubject ? t('publish.draftClearedForSubject', { subject: nextSubject }) : t('publish.draftCleared'))
  }

  return (
    <Card title={null} className={`panel-card ${isComposer ? 'publish-composer-card' : ''}`} bodyStyle={{ padding: 0 }}>
      <div className="publish-composer-form">
        <div className="publish-composer-toolbar publish-composer-toolbar-compact">
          <div className="publish-composer-toolbar-left">
            <Select
              className="publish-mode-select"
              size="small"
              value={payloadMode}
              options={payloadModeOptions}
              onChange={setPayloadMode}
            />

            <Button
              size="small"
              className="publish-format-button"
              onClick={() => {
                try {
                  if (!supportsStructuredFormatting(payloadMode)) {
                    return
                  }
                  setPayload((current) => formatJsonPayload(current || ''))
                } catch {
                  message.error(t('publish.currentContentInvalidJson'))
                }
              }}
            >
              {t('publish.format')}
            </Button>

            <div className="publish-toolbar-toggle">
              <Typography.Text type="secondary" className="publish-toolbar-toggle-label">
                JetStream
              </Typography.Text>
              <Switch
                size="small"
                checked={useJetStream}
                onChange={setUseJetStream}
                disabled={disabled}
              />
            </div>

            <Tooltip title={headerText.trim() || t('publish.headers')}>
              <Button
                size="small"
                className={`publish-headers-button ${headerSummary ? 'publish-headers-button-active' : ''}`}
                onClick={handleOpenHeadersModal}
              >
                <span className="publish-headers-button-label">{t('publish.headers')}</span>
                <span className="publish-headers-button-preview">{headerSummary || t('publish.noHeaders')}</span>
              </Button>
            </Tooltip>

            {timedMessageActive ? (
              <Tooltip title={t('publish.stopTimedMessage')}>
                <Button
                  size="small"
                  danger
                  className="publish-timed-stop-button"
                  icon={<PauseCircleOutlined />}
                  onClick={handleStopTimedMessage}
                />
              </Tooltip>
            ) : null}

            <Dropdown
              trigger={['click']}
              menu={{
                items: publishMoreMenuItems,
                onClick: handlePublishMoreMenuClick,
              }}
              overlayClassName="publish-more-menu-overlay"
            >
              <Button size="small" className="publish-more-button">
                <span className="publish-more-button-dots">...</span>
              </Button>
            </Dropdown>
          </div>

          <div className="publish-history-nav publish-history-nav-compact">
            <Tooltip title={t('publish.previous')}>
              <Button
                type="text"
                className="publish-history-button"
                icon={<LeftOutlined />}
                disabled={publishHistory.length === 0 || historyIndex === publishHistory.length - 1}
                onClick={handleSelectOlder}
              />
            </Tooltip>
            <Typography.Text className="publish-history-counter" title={t('publish.recentHistory')}>
              {historyLabel}
            </Typography.Text>
            <Tooltip title={t('publish.next')}>
              <Button
                type="text"
                className="publish-history-button"
                icon={<RightOutlined />}
                disabled={publishHistory.length === 0 || historyIndex === 0 || historyIndex === undefined}
                onClick={handleSelectNewer}
              />
            </Tooltip>
          </div>
        </div>

        <div className="publish-composer-body">
          <div className="publish-composer-subject-block">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="orders.created" size="small" />
            <Dropdown
              trigger={['click']}
              menu={{
                items: recentTopicItems,
                onClick: ({ key }) => setSubject(String(key)),
              }}
              disabled={recentTopicItems.length === 0}
              overlayClassName="publish-topic-dropdown-overlay"
            >
              <Button size="small" className="publish-topic-dropdown-button" icon={<DownOutlined />} />
            </Dropdown>
          </div>

          <div className="publish-composer-editor">
            <div className="publish-editor-shell">
              <Input.TextArea
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                rows={12}
                placeholder='{\n  "id": "A-1001"\n}'
                className="publish-editor-textarea"
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !disabled) {
                    event.preventDefault()
                    void handleSubmit()
                  }
                }}
              />
            </div>

            <div className="publish-editor-send-rail">
              <Tooltip title={disabled ? t('publish.connectFirst') : t('publish.sendMessage')}>
                <Button
                  type="primary"
                  shape="circle"
                  size="large"
                  disabled={disabled}
                  icon={<SendOutlined />}
                  className="publish-fab-button"
                  onClick={() => void handleSubmit()}
                />
              </Tooltip>
            </div>
          </div>

        </div>
      </div>

      <Modal
        open={headersModalOpen}
        title={t('publish.headers')}
        onCancel={() => setHeadersModalOpen(false)}
        onOk={handleConfirmHeadersModal}
        okText={t('publish.confirm')}
        cancelText={t('publish.cancel')}
        className="publish-modal"
        okButtonProps={{ className: 'publish-modal-confirm-button' }}
      >
        <Input.TextArea
          value={headerDraftText}
          onChange={(event) => setHeaderDraftText(event.target.value)}
          rows={8}
          placeholder={'Content-Type: application/json\nX-My-Header: value'}
          className="publish-headers-textarea"
        />
      </Modal>

      <Modal
        open={timedMessageOpen}
        title={t('publish.timedMessage')}
        onCancel={() => setTimedMessageOpen(false)}
        onOk={() => void handleConfirmTimedMessage()}
        okText={t('publish.confirm')}
        cancelText={t('publish.cancel')}
        className="publish-modal"
        okButtonProps={{ className: 'publish-modal-confirm-button' }}
      >
        <div className="timed-message-form-row">
          <Typography.Text className="timed-message-form-label">{t('publish.messageFrequency')}</Typography.Text>
          <InputNumber min={1} max={3600} value={timedFrequency} onChange={(value) => setTimedFrequency(Number(value ?? 4))} />
        </div>
      </Modal>

      <Modal
        open={clearRetainedOpen}
        title="Warning"
        onCancel={() => setClearRetainedOpen(false)}
        onOk={handleConfirmClearRetained}
        okText="OK"
        cancelText="Cancel"
        className="publish-modal"
        okButtonProps={{ className: 'publish-modal-confirm-button' }}
      >
        <div className="clear-retained-warning">
          <ExclamationCircleFilled className="clear-retained-warning-icon" />
          <div className="clear-retained-warning-copy">
            <Typography.Text className="clear-retained-warning-text">
              This operation will remove cached drafts from the local send history.
            </Typography.Text>
            <Typography.Text className="clear-retained-warning-topic">
              {subject.trim() ? `Current Topic: ${subject.trim()}` : 'Current Topic: all topics'}
            </Typography.Text>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
