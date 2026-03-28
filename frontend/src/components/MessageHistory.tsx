import { Button, Card, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord } from '../types'
import { formatHeaders, matchNatsSubject } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import { payloadModeOptions, transformPayloadForDisplay } from '../utils/payload'

interface MessageHistoryProps {
  messages: MessageRecord[]
  onReply: (message: MessageRecord) => void
  onReplayRequest: (message: MessageRecord) => void
  onRepublish: (message: MessageRecord) => void
  onAck: (message: MessageRecord) => void
  onNak: (message: MessageRecord) => void
  onTerm: (message: MessageRecord) => void
  onSelectMessage?: (message?: MessageRecord) => void
}

const kindColorMap: Record<MessageRecord['kind'], string> = {
  publish: 'gold',
  message: 'green',
  request: 'purple',
  response: 'cyan',
  reply: 'blue',
}

const ackColorMap: Record<NonNullable<MessageRecord['ackState']>, string> = {
  pending: 'processing',
  acked: 'success',
  nacked: 'warning',
  termed: 'error',
}

const requestStatusColorMap: Record<NonNullable<MessageRecord['requestStatus']>, string> = {
  pending: 'processing',
  succeeded: 'success',
  failed: 'error',
}

function payloadPreview(message: MessageRecord) {
  const normalized = message.payload.trim()
  if (!normalized) {
    return message.payloadBase64 ? '(binary payload)' : '(empty payload)'
  }
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized
}

export function MessageHistory({
  messages,
  onReply,
  onReplayRequest,
  onRepublish,
  onAck,
  onNak,
  onTerm,
  onSelectMessage,
}: MessageHistoryProps) {
  const { t } = useI18n()
  const [subjectFilter, setSubjectFilter] = useState('')
  const [keywordFilter, setKeywordFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | MessageRecord['kind']>('all')
  const [payloadViewMode, setPayloadViewMode] = useState<PayloadMode>('text')
  const [selectedMessageId, setSelectedMessageId] = useState<string>()

  const filteredMessages = useMemo(() => {
    const keyword = keywordFilter.trim().toLowerCase()

    return messages.filter((message) => {
      if (directionFilter !== 'all' && message.direction !== directionFilter) {
        return false
      }
      if (kindFilter !== 'all' && message.kind !== kindFilter) {
        return false
      }
      if (subjectFilter.trim() && !matchNatsSubject(message.subject, subjectFilter.trim())) {
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
  }, [directionFilter, kindFilter, keywordFilter, messages, subjectFilter])

  useEffect(() => {
    if (!filteredMessages.some((item) => item.id === selectedMessageId)) {
      setSelectedMessageId(filteredMessages[0]?.id)
    }
  }, [filteredMessages, selectedMessageId])

  const selectedMessage = filteredMessages.find((item) => item.id === selectedMessageId)
  const relatedMessage = selectedMessage?.relatedMessageId
    ? messages.find((item) => item.id === selectedMessage.relatedMessageId)
    : undefined

  const transformedPayload = useMemo(() => {
    if (!selectedMessage) {
      return ''
    }
    try {
      return transformPayloadForDisplay(selectedMessage.payload, selectedMessage.payloadBase64, payloadViewMode)
    } catch {
      return selectedMessage.payload
    }
  }, [payloadViewMode, selectedMessage])

  const inboundCount = useMemo(() => filteredMessages.filter((item) => item.direction === 'inbound').length, [filteredMessages])
  const outboundCount = useMemo(() => filteredMessages.filter((item) => item.direction === 'outbound').length, [filteredMessages])

  useEffect(() => {
    onSelectMessage?.(selectedMessage)
  }, [onSelectMessage, selectedMessage])

  const columns: ColumnsType<MessageRecord> = [
    {
      title: t('history.direction'),
      dataIndex: 'direction',
      key: 'direction',
      width: 86,
      render: (direction: MessageRecord['direction']) => (
        <Tag color={direction === 'inbound' ? 'green' : 'gold'}>{direction === 'inbound' ? 'IN' : 'OUT'}</Tag>
      ),
    },
    {
      title: t('history.type'),
      dataIndex: 'kind',
      key: 'kind',
      width: 92,
      render: (kind: MessageRecord['kind']) => <Tag color={kindColorMap[kind]}>{kind}</Tag>,
    },
    {
      title: t('history.status'),
      key: 'status',
      width: 112,
      render: (_, record) => {
        if (record.kind === 'request' && record.requestStatus) {
          return <Tag color={requestStatusColorMap[record.requestStatus]}>{record.requestStatus}</Tag>
        }
        if (record.ackEligible && record.ackState) {
          return <Tag color={ackColorMap[record.ackState]}>{record.ackState}</Tag>
        }
        return '-'
      },
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Payload Preview',
      dataIndex: 'payload',
      key: 'payload',
      ellipsis: true,
      render: (_, record) => <Typography.Text className="payload-text">{payloadPreview(record)}</Typography.Text>,
    },
    {
      title: t('history.time'),
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: 170,
      render: (value: string) => new Date(value).toLocaleString(),
    },
  ]

  const canReply = selectedMessage?.direction === 'inbound' && selectedMessage.reply
  const canReplayRequest = selectedMessage?.direction === 'outbound' && selectedMessage.kind === 'request'
  const canRepublish = selectedMessage?.direction === 'inbound'
  const canAck = selectedMessage?.ackEligible && selectedMessage.ackState === 'pending'

  return (
    <Card className="panel-card history-panel-card" styles={{ body: { padding: 0 } }} title={null}>
      <div className="history-panel-header">
        <div>
          <Typography.Text className="panel-section-eyebrow">History</Typography.Text>
          <Typography.Title level={5} className="history-panel-title">
            Message Timeline
          </Typography.Title>
        </div>
        <Space wrap>
          <Tag color="green">Inbound {inboundCount}</Tag>
          <Tag color="gold">Outbound {outboundCount}</Tag>
          <Tag>{t('history.visible', { count: filteredMessages.length })}</Tag>
        </Space>
      </div>

      <div className="history-filter-bar">
        <Input
          value={subjectFilter}
          onChange={(event) => setSubjectFilter(event.target.value)}
          placeholder={t('history.subjectFilterPlaceholder')}
          style={{ width: 220 }}
        />
        <Input
          value={keywordFilter}
          onChange={(event) => setKeywordFilter(event.target.value)}
          placeholder={t('history.keywordPlaceholder')}
          style={{ width: 300 }}
        />
        <Select
          value={directionFilter}
          onChange={setDirectionFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: t('history.allDirections') },
            { value: 'inbound', label: 'Inbound' },
            { value: 'outbound', label: 'Outbound' },
          ]}
        />
        <Select
          value={kindFilter}
          onChange={setKindFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: t('history.allTypes') },
            { value: 'message', label: 'message' },
            { value: 'publish', label: 'publish' },
            { value: 'request', label: 'request' },
            { value: 'response', label: 'response' },
            { value: 'reply', label: 'reply' },
          ]}
        />
        <Button
          onClick={() => {
            setSubjectFilter('')
            setKeywordFilter('')
            setDirectionFilter('all')
            setKindFilter('all')
          }}
        >
          {t('history.clearFilters')}
        </Button>
      </div>

      <div className="history-layout">
        <div className="history-table-pane">
          <div className="history-summary-row">
            <div className="history-summary-chip">
              <Typography.Text strong>{messages.length}</Typography.Text>
              <Typography.Text type="secondary">{t('history.totalMessages')}</Typography.Text>
            </div>
            <div className="history-summary-chip">
              <Typography.Text strong>{filteredMessages.length}</Typography.Text>
              <Typography.Text type="secondary">{t('history.filteredResults')}</Typography.Text>
            </div>
            <div className="history-summary-chip">
              <Typography.Text strong>{selectedMessage ? 1 : 0}</Typography.Text>
              <Typography.Text type="secondary">{t('history.currentSelection')}</Typography.Text>
            </div>
          </div>

          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={filteredMessages}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            locale={{ emptyText: t('history.empty') }}
            rowClassName={(record) => (record.id === selectedMessageId ? 'row-selected' : '')}
            onRow={(record) => ({
              onClick: () => setSelectedMessageId(record.id),
            })}
            className="history-table"
          />
        </div>

        <div className="history-detail-pane">
          {!selectedMessage ? (
            <div className="history-empty-state">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('history.selectDetail')} />
            </div>
          ) : (
            <>
              <div className="history-detail-card">
                <div className="history-detail-head">
                  <div>
                    <Typography.Text className="panel-section-eyebrow">{t('history.details')}</Typography.Text>
                    <Typography.Title level={5} className="history-detail-title">
                      {selectedMessage.subject}
                    </Typography.Title>
                  </div>
                  <Space wrap>
                    <Tag color={selectedMessage.direction === 'inbound' ? 'green' : 'gold'}>
                      {selectedMessage.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                    </Tag>
                    <Tag color={kindColorMap[selectedMessage.kind]}>{selectedMessage.kind}</Tag>
                    {selectedMessage.requestStatus ? (
                      <Tag color={requestStatusColorMap[selectedMessage.requestStatus]}>{selectedMessage.requestStatus}</Tag>
                    ) : null}
                    {selectedMessage.ackState ? <Tag color={ackColorMap[selectedMessage.ackState]}>{selectedMessage.ackState}</Tag> : null}
                  </Space>
                </div>

                <div className="history-detail-meta-grid">
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">Request ID</Typography.Text>
                    <Typography.Text>{selectedMessage.correlationId ?? '-'}</Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">Reply Subject</Typography.Text>
                    <Typography.Text>{selectedMessage.reply ?? '-'}</Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">{t('history.relatedMessage')}</Typography.Text>
                    {relatedMessage ? (
                      <Space wrap>
                        <Typography.Text>{relatedMessage.subject}</Typography.Text>
                        <Button size="small" onClick={() => setSelectedMessageId(relatedMessage.id)}>
                          {t('history.jump')}
                        </Button>
                      </Space>
                    ) : (
                      <Typography.Text>{selectedMessage.relatedMessageId ?? '-'}</Typography.Text>
                    )}
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">{t('history.subscriptionMatch')}</Typography.Text>
                    <Typography.Text>{selectedMessage.subscriptionPattern ?? '-'}</Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">{t('history.requestTimeout')}</Typography.Text>
                    <Typography.Text>
                      {selectedMessage.requestTimeoutMs ? `${selectedMessage.requestTimeoutMs} ms` : '-'}
                    </Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">{t('history.requestDuration')}</Typography.Text>
                    <Typography.Text>
                      {selectedMessage.requestDurationMs ? `${selectedMessage.requestDurationMs} ms` : '-'}
                    </Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">JetStream</Typography.Text>
                    <Typography.Text>
                      {selectedMessage.jetStream
                        ? `${selectedMessage.jetStreamStream ?? '-'} / ${selectedMessage.jetStreamConsumer ?? '-'} / Seq ${selectedMessage.jetStreamSequence ?? '-'}`
                        : '-'}
                    </Typography.Text>
                  </div>
                  <div className="history-detail-meta-item">
                    <Typography.Text type="secondary">{t('history.errorInfo')}</Typography.Text>
                    <Typography.Text>{selectedMessage.errorMessage ?? '-'}</Typography.Text>
                  </div>
                </div>

                <div className="history-detail-actions">
                  {canReply ? (
                    <Button size="small" onClick={() => onReply(selectedMessage)}>
                      {t('history.sendReply')}
                    </Button>
                  ) : null}
                  {canReplayRequest ? (
                    <Button size="small" onClick={() => onReplayRequest(selectedMessage)}>
                      {t('history.replayRequest')}
                    </Button>
                  ) : null}
                  {canRepublish ? (
                    <Button size="small" onClick={() => onRepublish(selectedMessage)}>
                      {t('history.republish')}
                    </Button>
                  ) : null}
                  {canAck ? (
                    <>
                      <Button size="small" type="primary" onClick={() => onAck(selectedMessage)}>
                        Ack
                      </Button>
                      <Button size="small" onClick={() => onNak(selectedMessage)}>
                        Nak
                      </Button>
                      <Button size="small" danger onClick={() => onTerm(selectedMessage)}>
                        Term
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="history-detail-block">
                <div className="history-detail-block-head">
                  <Typography.Title level={5}>Headers</Typography.Title>
                </div>
                <pre className="message-pre history-pre">{formatHeaders(selectedMessage.headers) || t('history.noHeaders')}</pre>
              </div>

              <div className="history-detail-block history-payload-block">
                <div className="history-detail-block-head">
                  <Typography.Title level={5}>Payload</Typography.Title>
                  <Select
                    size="small"
                    value={payloadViewMode}
                    style={{ width: 148 }}
                    options={payloadModeOptions}
                    onChange={setPayloadViewMode}
                  />
                </div>
                <pre className="message-pre history-pre">{transformedPayload}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
