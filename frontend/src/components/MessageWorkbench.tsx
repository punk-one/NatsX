import { Button, Card, Descriptions, Empty, Input, Select, Space, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord } from '../types'
import { formatHeaders, matchNatsSubject } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import { payloadModeOptions, transformPayloadForDisplay } from '../utils/payload'

interface MessageWorkbenchProps {
  messages: MessageRecord[]
  selectedMessage?: MessageRecord
  subjectFilter?: string
  onReply: (message: MessageRecord) => void
  onReplayRequest: (message: MessageRecord) => void
  onRepublish: (message: MessageRecord) => void
  onAck: (message: MessageRecord) => void
  onNak: (message: MessageRecord) => void
  onTerm: (message: MessageRecord) => void
  onSubjectFilterChange?: (subject: string) => void
  onSelectMessage?: (message?: MessageRecord) => void
}

const kindColorMap: Record<MessageRecord['kind'], string> = {
  publish: 'gold',
  message: 'green',
  request: 'purple',
  response: 'cyan',
  reply: 'blue',
}

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

function payloadPreview(payload: string) {
  const normalized = payload.trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= 280) {
    return normalized
  }
  return `${normalized.slice(0, 280)}…`
}

function requestStatusLabel(message: MessageRecord) {
  if (message.kind !== 'request') {
    return undefined
  }
  return message.requestStatus ?? 'pending'
}

export function MessageWorkbench({
  messages,
  selectedMessage,
  subjectFilter,
  onReply,
  onReplayRequest,
  onRepublish,
  onAck,
  onNak,
  onTerm,
  onSubjectFilterChange,
  onSelectMessage,
}: MessageWorkbenchProps) {
  const { t } = useI18n()
  const [internalSubjectFilter, setInternalSubjectFilter] = useState('')
  const [keywordFilter, setKeywordFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | MessageRecord['kind']>('all')
  const [payloadViewMode, setPayloadViewMode] = useState<PayloadMode>('text')
  const [selectedMessageId, setSelectedMessageId] = useState<string>()
  const activeSubjectFilter = subjectFilter ?? internalSubjectFilter

  const updateSubjectFilter = (nextSubject: string) => {
    onSubjectFilterChange?.(nextSubject)
    if (subjectFilter === undefined) {
      setInternalSubjectFilter(nextSubject)
    }
  }

  const filteredMessages = useMemo(() => {
    const keyword = keywordFilter.trim().toLowerCase()

    return [...messages]
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
      .filter((message) => {
        if (directionFilter !== 'all' && message.direction !== directionFilter) {
          return false
        }
        if (kindFilter !== 'all' && message.kind !== kindFilter) {
          return false
        }
        if (activeSubjectFilter.trim() && !matchNatsSubject(message.subject, activeSubjectFilter.trim())) {
          return false
        }
        if (!keyword) {
          return true
        }

        const searchable = [
          message.subject,
          message.payload,
          message.reply,
          message.subscriptionPattern,
          message.correlationId,
          message.relatedMessageId,
          message.replaySourceMessageId,
          message.errorMessage,
          message.requestStatus,
        ]
          .filter(Boolean)
          .join('\n')
          .toLowerCase()

        return searchable.includes(keyword)
      })
  }, [activeSubjectFilter, directionFilter, kindFilter, keywordFilter, messages])

  useEffect(() => {
    if (selectedMessage && filteredMessages.some((item) => item.id === selectedMessage.id)) {
      setSelectedMessageId(selectedMessage.id)
      return
    }

    if (!filteredMessages.some((item) => item.id === selectedMessageId)) {
      setSelectedMessageId(filteredMessages[0]?.id)
    }
  }, [filteredMessages, selectedMessage, selectedMessageId])

  const currentMessage = filteredMessages.find((item) => item.id === selectedMessageId)
  const inboundCount = filteredMessages.filter((item) => item.direction === 'inbound').length
  const outboundCount = filteredMessages.filter((item) => item.direction === 'outbound').length
  const transformedPayload = useMemo(() => {
    if (!currentMessage) {
      return ''
    }
    try {
      return transformPayloadForDisplay(currentMessage.payload, currentMessage.payloadBase64, payloadViewMode)
    } catch {
      return currentMessage.payload
    }
  }, [currentMessage, payloadViewMode])

  useEffect(() => {
    onSelectMessage?.(currentMessage)
  }, [currentMessage, onSelectMessage])

  const buildActions = (message: MessageRecord) => {
    const actions: ReactNode[] = []

    if (message.direction === 'inbound' && message.reply) {
      actions.push(
        <Button key="reply" size="small" onClick={() => onReply(message)}>
          {t('workbench.sendReply')}
        </Button>,
      )
    }
    if (message.direction === 'outbound' && message.kind === 'request') {
      actions.push(
        <Button key="replay" size="small" onClick={() => onReplayRequest(message)}>
          {t('workbench.replayRequest')}
        </Button>,
      )
    }
    if (message.direction === 'inbound') {
      actions.push(
        <Button key="republish" size="small" onClick={() => onRepublish(message)}>
          {t('workbench.republish')}
        </Button>,
      )
    }
    if (message.ackEligible && message.ackState === 'pending') {
      actions.push(
        <Button key="ack" size="small" type="primary" onClick={() => onAck(message)}>
          Ack
        </Button>,
      )
      actions.push(
        <Button key="nak" size="small" onClick={() => onNak(message)}>
          Nak
        </Button>,
      )
      actions.push(
        <Button key="term" size="small" danger onClick={() => onTerm(message)}>
          Term
        </Button>,
      )
    }

    return actions
  }

  return (
    <Card
      title={t('workbench.messageFlow')}
      className="panel-card message-workbench-card"
      extra={
        <Space wrap>
          <Tag color="green">{t('workbench.inbound', { count: inboundCount })}</Tag>
          <Tag color="gold">{t('workbench.outbound', { count: outboundCount })}</Tag>
          {activeSubjectFilter ? <Tag color="blue">{t('workbench.filter', { value: activeSubjectFilter })}</Tag> : null}
        </Space>
      }
    >
      <Space wrap className="filter-bar">
        <Input
          value={activeSubjectFilter}
          onChange={(event) => updateSubjectFilter(event.target.value)}
          placeholder={t('workbench.subjectFilterPlaceholder')}
          style={{ width: 220 }}
        />
        <Input
          value={keywordFilter}
          onChange={(event) => setKeywordFilter(event.target.value)}
          placeholder={t('workbench.keywordPlaceholder')}
          style={{ width: 280 }}
        />
        <Select
          value={directionFilter}
          onChange={setDirectionFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: t('workbench.allDirections') },
            { value: 'inbound', label: 'Inbound' },
            { value: 'outbound', label: 'Outbound' },
          ]}
        />
        <Select
          value={kindFilter}
          onChange={setKindFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: t('workbench.allTypes') },
            { value: 'message', label: 'message' },
            { value: 'publish', label: 'publish' },
            { value: 'request', label: 'request' },
            { value: 'response', label: 'response' },
            { value: 'reply', label: 'reply' },
          ]}
        />
        <Button
          onClick={() => {
            updateSubjectFilter('')
            setKeywordFilter('')
            setDirectionFilter('all')
            setKindFilter('all')
          }}
        >
          {t('workbench.clearFilters')}
        </Button>
      </Space>

      <div className="message-workbench-body">
        <div className="message-stream-list">
          {filteredMessages.length === 0 ? (
            <Card className="message-stream-card">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workbench.empty')} />
            </Card>
          ) : (
            filteredMessages.map((message) => {
              const actions = buildActions(message)
              const requestStatus = requestStatusLabel(message)
              return (
                <div
                  key={message.id}
                  className={`message-bubble-row ${message.direction === 'outbound' ? 'message-bubble-row-outbound' : 'message-bubble-row-inbound'}`}
                >
                  <div
                    className={`message-stream-card ${message.direction === 'outbound' ? 'message-stream-card-outbound' : 'message-stream-card-inbound'} ${message.id === currentMessage?.id ? 'message-stream-card-selected' : ''}`}
                    onClick={() => setSelectedMessageId(message.id)}
                  >
                    <div className="message-stream-card-head">
                      <Space wrap>
                        <Tag color={message.direction === 'outbound' ? 'gold' : 'green'}>
                          {message.direction === 'outbound' ? 'OUT' : 'IN'}
                        </Tag>
                        <Tag color={kindColorMap[message.kind]}>{message.kind}</Tag>
                        {requestStatus ? <Tag color={requestStatusColorMap[requestStatus]}>{requestStatus}</Tag> : null}
                        {message.ackEligible && message.ackState ? <Tag color={ackColorMap[message.ackState]}>{message.ackState}</Tag> : null}
                        {message.jetStream ? <Tag color="cyan">JetStream</Tag> : null}
                        {message.replaySourceMessageId ? <Tag color="purple">{t('workbench.replayTag')}</Tag> : null}
                      </Space>
                      <Typography.Text className="message-card-time">
                        {new Date(message.receivedAt).toLocaleString()}
                      </Typography.Text>
                    </div>

                    <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
                      {message.subject}
                    </Typography.Title>

                    <div className="message-card-tags">
                      {message.subscriptionPattern ? <Tag>{message.subscriptionPattern}</Tag> : null}
                      {message.correlationId ? <Tag color="blue">{message.correlationId}</Tag> : null}
                      {message.reply ? <Tag color="geekblue">Reply: {message.reply}</Tag> : null}
                    </div>

                    <div className="message-payload-preview">{payloadPreview(message.payload) || t('workbench.emptyPayload')}</div>

                    {message.errorMessage ? <Typography.Text type="danger">{message.errorMessage}</Typography.Text> : null}

                    {actions.length > 0 ? <div className="message-card-actions">{actions}</div> : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <Card className="message-detail-card" title={t('workbench.detailTitle')}>
          {!currentMessage ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workbench.selectDetail')} />
          ) : (
            <>
              <div className="message-detail-tags">
                <Tag color={currentMessage.direction === 'outbound' ? 'gold' : 'green'}>
                  {currentMessage.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                </Tag>
                <Tag color={kindColorMap[currentMessage.kind]}>{currentMessage.kind}</Tag>
                {currentMessage.requestStatus ? (
                  <Tag color={requestStatusColorMap[currentMessage.requestStatus]}>{currentMessage.requestStatus}</Tag>
                ) : null}
                {currentMessage.ackState ? <Tag color={ackColorMap[currentMessage.ackState]}>{currentMessage.ackState}</Tag> : null}
              </div>

              <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
                <Descriptions.Item label="Subject">{currentMessage.subject}</Descriptions.Item>
                <Descriptions.Item label="Reply Subject">{currentMessage.reply ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Subscription Pattern">{currentMessage.subscriptionPattern ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Request ID">{currentMessage.correlationId ?? '-'}</Descriptions.Item>
                <Descriptions.Item label={t('workbench.relatedMessage')}>{currentMessage.relatedMessageId ?? '-'}</Descriptions.Item>
                <Descriptions.Item label={t('workbench.replaySource')}>{currentMessage.replaySourceMessageId ?? '-'}</Descriptions.Item>
                <Descriptions.Item label={t('workbench.requestTimeout')}>
                  {currentMessage.requestTimeoutMs ? `${currentMessage.requestTimeoutMs} ms` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('workbench.requestDuration')}>
                  {currentMessage.requestDurationMs ? `${currentMessage.requestDurationMs} ms` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="JetStream">
                  {currentMessage.jetStream
                    ? `${currentMessage.jetStreamStream ?? '-'} / ${currentMessage.jetStreamConsumer ?? '-'} / Seq ${currentMessage.jetStreamSequence ?? '-'}`
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Headers">
                  <pre className="message-pre">{formatHeaders(currentMessage.headers)}</pre>
                </Descriptions.Item>
                <Descriptions.Item
                  label={
                    <Space wrap>
                      <span>Payload</span>
                      <Select
                        size="small"
                        value={payloadViewMode}
                        style={{ width: 140 }}
                        options={payloadModeOptions}
                        onChange={setPayloadViewMode}
                      />
                    </Space>
                  }
                >
                  <pre className="message-pre">{transformedPayload}</pre>
                </Descriptions.Item>
                <Descriptions.Item label={t('workbench.errorInfo')}>{currentMessage.errorMessage ?? '-'}</Descriptions.Item>
              </Descriptions>
            </>
          )}
        </Card>
      </div>
    </Card>
  )
}
