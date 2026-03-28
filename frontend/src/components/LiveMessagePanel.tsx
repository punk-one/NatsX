import { ClockCircleOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Segmented, Select, Space, Tag, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord } from '../types'
import { matchNatsSubject } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import { payloadModeOptions, transformPayloadForDisplay } from '../utils/payload'

interface LiveMessagePanelProps {
  messages: MessageRecord[]
  selectedMessage?: MessageRecord
  subjectFilter?: string
  searchTopic?: string
  searchPayload?: string
  onSelectMessage?: (message?: MessageRecord) => void
  onReply: (message: MessageRecord) => void
  onReplayRequest: (message: MessageRecord) => void
  onRepublish: (message: MessageRecord) => void
  onAck: (message: MessageRecord) => void
  onNak: (message: MessageRecord) => void
  onTerm: (message: MessageRecord) => void
}

type FlowFilter = 'all' | 'inbound' | 'outbound'

const requestStatusColorMap: Record<NonNullable<MessageRecord['requestStatus']>, string> = {
  pending: 'processing',
  succeeded: 'success',
  failed: 'error',
}

const ackColorMap: Record<NonNullable<MessageRecord['ackState']>, string> = {
  pending: 'processing',
  acked: 'success',
  nacked: 'warning',
  termed: 'error',
}

function kindLabel(kind: MessageRecord['kind']) {
  switch (kind) {
    case 'publish':
      return 'Published'
    case 'message':
      return 'Message'
    case 'request':
      return 'Request'
    case 'response':
      return 'Response'
    case 'reply':
      return 'Reply'
    default:
      return kind
  }
}

function messageActions(message: MessageRecord) {
  return {
    canReply: message.direction === 'inbound' && Boolean(message.reply),
    canReplayRequest: message.direction === 'outbound' && message.kind === 'request',
    canRepublish: message.direction === 'inbound',
    canAck: message.ackEligible && message.ackState === 'pending',
  }
}

export function LiveMessagePanel({
  messages,
  selectedMessage,
  subjectFilter,
  searchTopic,
  searchPayload,
  onSelectMessage,
  onReply,
  onReplayRequest,
  onRepublish,
  onAck,
  onNak,
  onTerm,
}: LiveMessagePanelProps) {
  const { t } = useI18n()
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all')
  const [payloadViewMode, setPayloadViewMode] = useState<PayloadMode>('json')
  const [selectedMessageId, setSelectedMessageId] = useState<string>()
  const streamRef = useRef<HTMLDivElement>(null)
  const lastVisibleMessageIdRef = useRef<string>()
  const isPinnedToBottomRef = useRef(true)

  const inboundCount = useMemo(() => messages.filter((item) => item.direction === 'inbound').length, [messages])
  const outboundCount = useMemo(() => messages.filter((item) => item.direction === 'outbound').length, [messages])

  const filteredMessages = useMemo(() => {
    const normalizedSearchTopic = searchTopic?.trim().toLowerCase()
    const normalizedSearchPayload = searchPayload?.trim().toLowerCase()

    return [...messages]
      .filter((item) => {
        if (flowFilter !== 'all' && item.direction !== flowFilter) {
          return false
        }
        if (subjectFilter?.trim() && !matchNatsSubject(item.subject, subjectFilter.trim())) {
          return false
        }
        if (normalizedSearchTopic && !item.subject.toLowerCase().includes(normalizedSearchTopic)) {
          return false
        }
        if (normalizedSearchPayload && !item.payload.toLowerCase().includes(normalizedSearchPayload)) {
          return false
        }
        return true
      })
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))
  }, [flowFilter, messages, searchPayload, searchTopic, subjectFilter])

  useEffect(() => {
    if (selectedMessage && filteredMessages.some((item) => item.id === selectedMessage.id)) {
      if (selectedMessage.id !== selectedMessageId) {
        setSelectedMessageId(selectedMessage.id)
      }
      return
    }

    if (!filteredMessages.some((item) => item.id === selectedMessageId)) {
      const nextSelectedMessageId = filteredMessages[filteredMessages.length - 1]?.id
      if (nextSelectedMessageId !== selectedMessageId) {
        setSelectedMessageId(nextSelectedMessageId)
      }
    }
  }, [filteredMessages, selectedMessage, selectedMessageId])

  useEffect(() => {
    const stream = streamRef.current
    if (!stream) {
      return
    }
    const nextLastVisibleMessageId = filteredMessages[filteredMessages.length - 1]?.id
    const hasNewTailMessage =
      Boolean(nextLastVisibleMessageId) && nextLastVisibleMessageId !== lastVisibleMessageIdRef.current
    const wasViewingLatestMessage =
      !selectedMessageId ||
      !lastVisibleMessageIdRef.current ||
      selectedMessageId === lastVisibleMessageIdRef.current ||
      selectedMessageId === nextLastVisibleMessageId

    if (filteredMessages.length === 0 || (hasNewTailMessage && isPinnedToBottomRef.current && wasViewingLatestMessage)) {
      stream.scrollTop = stream.scrollHeight
    }

    lastVisibleMessageIdRef.current = nextLastVisibleMessageId
  }, [filteredMessages, selectedMessageId])

  const currentMessage = filteredMessages.find((item) => item.id === selectedMessageId)

  useEffect(() => {
    if (!onSelectMessage) {
      return
    }

    if (!currentMessage && selectedMessage) {
      onSelectMessage(undefined)
      return
    }

    if (currentMessage && currentMessage.id !== selectedMessage?.id) {
      onSelectMessage(currentMessage)
    }
  }, [currentMessage, onSelectMessage, selectedMessage])

  const handleStreamScroll = () => {
    const stream = streamRef.current
    if (!stream) {
      return
    }

    const distanceFromBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight
    isPinnedToBottomRef.current = distanceFromBottom <= 24
  }

  return (
    <Card className="panel-card live-message-card" bodyStyle={{ padding: 0 }} title={null}>
      <div className="live-message-topbar">
        <div className="live-message-topbar-left">
          <Select
            size="small"
            value={payloadViewMode}
            className="publish-mode-select live-message-mode-select"
            options={payloadModeOptions}
            onChange={setPayloadViewMode}
          />
        </div>
        <div className="live-message-topbar-center">
          <span className="live-message-summary-chip live-message-summary-chip-inbound">{t('liveMessage.received', { count: inboundCount })}</span>
          <span className="live-message-summary-chip live-message-summary-chip-outbound">{t('liveMessage.sent', { count: outboundCount })}</span>
          <span className="live-message-summary-chip">{t('liveMessage.visible', { count: filteredMessages.length })}</span>
        </div>
        <div className="live-message-topbar-right">
          <Segmented
            size="small"
            className="live-message-flow-segmented"
            value={flowFilter}
            onChange={(value) => setFlowFilter(value as FlowFilter)}
            options={[
              { label: t('liveMessage.all'), value: 'all' },
              { label: t('liveMessage.receivedFilter'), value: 'inbound' },
              { label: t('liveMessage.publishedFilter'), value: 'outbound' },
            ]}
          />
        </div>
      </div>

      <div className="live-message-layout live-message-layout-stream">
        {filteredMessages.length === 0 ? (
          <div className="live-message-stream live-message-stream-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('liveMessage.empty')} />
          </div>
        ) : (
          <div ref={streamRef} className="live-message-stream" onScroll={handleStreamScroll}>
            {filteredMessages.map((item) => {
              const { canAck, canReplayRequest, canReply, canRepublish } = messageActions(item)
              const hasActions = canReply || canReplayRequest || canRepublish || canAck
              const isOutboundMessage = item.direction === 'outbound'

              let transformedPayload = item.payload
              try {
                transformedPayload = transformPayloadForDisplay(item.payload, item.payloadBase64, payloadViewMode)
              } catch {
                transformedPayload = item.payload
              }

              return (
                <div
                  key={item.id}
                  className={`live-message-row ${isOutboundMessage ? 'live-message-row-outbound' : 'live-message-row-inbound'} ${
                    item.id === currentMessage?.id ? 'live-message-row-active' : ''
                  }`}
                  onClick={() => {
                    setSelectedMessageId(item.id)
                    isPinnedToBottomRef.current = item.id === filteredMessages[filteredMessages.length - 1]?.id
                  }}
                >
                  <div className={`live-message-bubble ${isOutboundMessage ? 'live-message-bubble-outbound' : ''}`}>
                    <div className="live-message-bubble-card">
                      <div className="live-message-meta">
                        <div className="live-message-meta-head">
                          <div className="live-message-topic-inline">
                            <Typography.Text className="live-message-topic-label">{`${t('liveMessage.topic')}:`}</Typography.Text>
                            <Typography.Title level={5} className="live-message-title">
                              {item.subject}
                            </Typography.Title>
                          </div>

                          <div className="live-message-meta-head-side">
                            <Typography.Text type="secondary" className="live-message-meta-summary">
                              {[`${item.size} bytes`, item.jetStream ? 'JetStream' : undefined].filter(Boolean).join(' · ')}
                            </Typography.Text>
                            <Typography.Text type="secondary" className="live-message-meta-pill">
                              {kindLabel(item.kind)}
                            </Typography.Text>
                          </div>
                        </div>

                        {item.requestStatus || item.ackState ? (
                          <div className="live-message-meta-line live-message-meta-line-status">
                            <Space size={4} className="live-message-item-status">
                              {item.requestStatus ? (
                                <Tag color={requestStatusColorMap[item.requestStatus]}>{item.requestStatus}</Tag>
                              ) : null}
                              {item.ackState ? <Tag color={ackColorMap[item.ackState]}>{item.ackState}</Tag> : null}
                            </Space>
                          </div>
                        ) : null}

                        {item.reply ? (
                          <Typography.Text type="secondary" className="live-message-replyto">
                            {`${t('liveMessage.replyTo')}: ${item.reply}`}
                          </Typography.Text>
                        ) : null}
                      </div>

                      <div className="live-message-content">
                        <pre className="message-pre live-message-payload-pre">{transformedPayload}</pre>
                      </div>

                      {hasActions ? (
                        <div className="live-message-footer">
                          <Space wrap className="live-message-action-group">
                            {canReply ? (
                              <Button size="small" onClick={() => onReply(item)}>
                                Reply
                              </Button>
                            ) : null}
                            {canReplayRequest ? (
                              <Button size="small" onClick={() => onReplayRequest(item)}>
                                Replay Request
                              </Button>
                            ) : null}
                            {canRepublish ? (
                              <Button size="small" onClick={() => onRepublish(item)}>
                                {t('liveMessage.republish')}
                              </Button>
                            ) : null}
                            {canAck ? (
                              <>
                                <Button size="small" type="primary" onClick={() => onAck(item)}>
                                  Ack
                                </Button>
                                <Button size="small" onClick={() => onNak(item)}>
                                  Nak
                                </Button>
                                <Button size="small" danger onClick={() => onTerm(item)}>
                                  Term
                                </Button>
                              </>
                            ) : null}
                          </Space>
                        </div>
                      ) : null}
                    </div>

                    <Typography.Text type="secondary" className="live-message-meta-time">
                      <ClockCircleOutlined />
                      <span>{new Date(item.receivedAt).toLocaleString()}</span>
                    </Typography.Text>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
