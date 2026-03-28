import { Empty, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord } from '../types'

interface RequestComparePanelProps {
  messages: MessageRecord[]
  selectedMessage?: MessageRecord
}

interface TextDiffRow {
  key: string
  line: number
  left: string
  right: string
  status: 'same' | 'changed'
}

interface HeaderDiffRow {
  key: string
  header: string
  left: string
  right: string
  status: 'same' | 'added' | 'removed' | 'changed'
}

function diffStatusLabel(status: HeaderDiffRow['status']) {
  switch (status) {
    case 'added':
      return 'added'
    case 'removed':
      return 'removed'
    case 'changed':
      return 'changed'
    default:
      return 'same'
  }
}

function resolveBaseRequest(selectedMessage: MessageRecord | undefined, messages: MessageRecord[]) {
  if (!selectedMessage) {
    return undefined
  }

  let candidate = selectedMessage
  if (candidate.kind === 'response' && candidate.relatedMessageId) {
    const relatedRequest = messages.find((item) => item.id === candidate.relatedMessageId)
    if (relatedRequest) {
      candidate = relatedRequest
    }
  }

  if (candidate.kind !== 'request' || candidate.direction !== 'outbound') {
    return undefined
  }

  if (candidate.replaySourceMessageId) {
    return messages.find((item) => item.id === candidate.replaySourceMessageId) ?? candidate
  }

  return candidate
}

function findResponse(messages: MessageRecord[], requestMessage?: MessageRecord) {
  if (!requestMessage) {
    return undefined
  }

  return messages.find((item) => item.kind === 'response' && item.relatedMessageId === requestMessage.id)
}

function tryPrettyJson(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ''
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value ?? ''
  }
}

function payloadFormat(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return 'EMPTY'
  }

  try {
    JSON.parse(trimmed)
    return 'JSON'
  } catch {
    return 'TEXT'
  }
}

function buildTextDiffRows(leftValue?: string, rightValue?: string) {
  const leftLines = tryPrettyJson(leftValue).split(/\r?\n/)
  const rightLines = tryPrettyJson(rightValue).split(/\r?\n/)
  const maxLines = Math.max(leftLines.length, rightLines.length, 1)

  return Array.from({ length: maxLines }, (_, index) => {
    const left = leftLines[index] ?? ''
    const right = rightLines[index] ?? ''

    return {
      key: `line_${index + 1}`,
      line: index + 1,
      left,
      right,
      status: left === right ? 'same' : 'changed',
    } satisfies TextDiffRow
  })
}

function headerValue(headers: MessageRecord['headers'], key: string) {
  return headers?.[key]?.join(', ') ?? ''
}

function buildHeaderDiffRows(leftHeaders?: MessageRecord['headers'], rightHeaders?: MessageRecord['headers']): HeaderDiffRow[] {
  const keys = Array.from(
    new Set([...(leftHeaders ? Object.keys(leftHeaders) : []), ...(rightHeaders ? Object.keys(rightHeaders) : [])]),
  ).sort((left, right) => left.localeCompare(right))

  return keys.length > 0
    ? keys.map<HeaderDiffRow>((header) => {
        const left = headerValue(leftHeaders, header)
        const right = headerValue(rightHeaders, header)
        let status: HeaderDiffRow['status'] = 'same'

        if (!left && right) {
          status = 'added'
        } else if (left && !right) {
          status = 'removed'
        } else if (left !== right) {
          status = 'changed'
        }

        return {
          key: header,
          header,
          left,
          right,
          status,
        }
      })
    : [
        {
          key: 'empty',
          header: '(empty)',
          left: '',
          right: '',
          status: 'same',
        },
      ]
}

function buildResponseViewValue(
  requestMessage: MessageRecord | undefined,
  responseMessage: MessageRecord | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (responseMessage?.payload) {
    return responseMessage.payload
  }
  if (requestMessage?.errorMessage) {
    return `ERROR\n${requestMessage.errorMessage}`
  }
  if (requestMessage?.requestStatus === 'failed') {
    return t('requestCompare.requestFailedNoResponse')
  }
  return t('requestCompare.noResponse')
}

function statusColor(status?: MessageRecord['requestStatus']) {
  switch (status) {
    case 'failed':
      return 'error'
    case 'succeeded':
      return 'success'
    case 'pending':
      return 'processing'
    default:
      return 'default'
  }
}

function CompareSummary({
  title,
  requestMessage,
  responseMessage,
}: {
  title: string
  requestMessage?: MessageRecord
  responseMessage?: MessageRecord
}) {
  const { t } = useI18n()
  return (
    <div className="compare-summary-card">
      {!requestMessage ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('requestCompare.empty')} />
      ) : (
        <>
          <div className="compare-summary-head">
            <Typography.Title level={5} className="compare-summary-title">
              {title}
            </Typography.Title>
          </div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text strong>{requestMessage.subject}</Typography.Text>
              {requestMessage.requestStatus ? (
                <Tag color={statusColor(requestMessage.requestStatus)}>{requestMessage.requestStatus}</Tag>
              ) : null}
              {requestMessage.replaySourceMessageId ? <Tag color="gold">{t('requestCompare.replay')}</Tag> : <Tag color="blue">{t('requestCompare.original')}</Tag>}
              <Tag>{payloadFormat(requestMessage.payload)}</Tag>
            </Space>
            <Typography.Text type="secondary">Request ID：{requestMessage.correlationId ?? '-'}</Typography.Text>
            <Typography.Text type="secondary">
              {t('requestCompare.timeout', { value: requestMessage.requestTimeoutMs ? `${requestMessage.requestTimeoutMs} ms` : '-' })}
            </Typography.Text>
            <Typography.Text type="secondary">
              {t('requestCompare.duration', { value: requestMessage.requestDurationMs ? `${requestMessage.requestDurationMs} ms` : '-' })}
            </Typography.Text>
            <Typography.Text type="secondary">
              {t('requestCompare.response', { value: responseMessage?.payload ? `${responseMessage.payload.length} bytes` : requestMessage.errorMessage ?? '-' })}
            </Typography.Text>
          </Space>
        </>
      )}
    </div>
  )
}

export function RequestComparePanel({ messages, selectedMessage }: RequestComparePanelProps) {
  const { t } = useI18n()
  const baseRequest = useMemo(() => resolveBaseRequest(selectedMessage, messages), [messages, selectedMessage])

  const replayRequests = useMemo(
    () =>
      baseRequest
        ? messages
            .filter(
              (item) =>
                item.kind === 'request' && item.direction === 'outbound' && item.replaySourceMessageId === baseRequest.id,
            )
            .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
        : [],
    [baseRequest, messages],
  )

  const [selectedReplayRequestId, setSelectedReplayRequestId] = useState<string>()

  useEffect(() => {
    if (!selectedMessage) {
      return
    }

    if (selectedMessage.kind === 'request' && selectedMessage.replaySourceMessageId) {
      setSelectedReplayRequestId(selectedMessage.id)
      return
    }

    if (selectedMessage.kind === 'response' && selectedMessage.relatedMessageId) {
      const relatedRequest = messages.find((item) => item.id === selectedMessage.relatedMessageId)
      if (relatedRequest?.replaySourceMessageId) {
        setSelectedReplayRequestId(relatedRequest.id)
        return
      }
    }

    if (!replayRequests.some((item) => item.id === selectedReplayRequestId)) {
      setSelectedReplayRequestId(replayRequests[0]?.id)
    }
  }, [messages, replayRequests, selectedMessage, selectedReplayRequestId])

  const selectedReplayRequest = replayRequests.find((item) => item.id === selectedReplayRequestId)
  const baseResponse = useMemo(() => findResponse(messages, baseRequest), [baseRequest, messages])
  const replayResponse = useMemo(() => findResponse(messages, selectedReplayRequest), [messages, selectedReplayRequest])

  const textDiffColumns: ColumnsType<TextDiffRow> = [
    {
      title: '#',
      dataIndex: 'line',
      key: 'line',
      width: 56,
    },
    {
      title: t('requestCompare.originalRequest'),
      dataIndex: 'left',
      key: 'left',
      render: (value: string) => <pre className="compare-pre">{value || ' '}</pre>,
    },
    {
      title: t('requestCompare.replayResult'),
      dataIndex: 'right',
      key: 'right',
      render: (value: string) => <pre className="compare-pre">{value || ' '}</pre>,
    },
  ]

  const headerDiffColumns: ColumnsType<HeaderDiffRow> = [
    {
      title: t('requestCompare.requestHeaders'),
      dataIndex: 'header',
      key: 'header',
      width: 220,
      render: (value: string, record) => (
        <Space>
          <Typography.Text code>{value}</Typography.Text>
          {record.status !== 'same' ? (
            <Tag color={record.status === 'changed' ? 'warning' : record.status === 'added' ? 'success' : 'error'}>
              {t(`requestCompare.${diffStatusLabel(record.status)}`)}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: t('requestCompare.originalRequest'),
      dataIndex: 'left',
      key: 'left',
      render: (value: string) => <pre className="compare-pre">{value || ' '}</pre>,
    },
    {
      title: t('requestCompare.replayRequest'),
      dataIndex: 'right',
      key: 'right',
      render: (value: string) => <pre className="compare-pre">{value || ' '}</pre>,
    },
  ]

  if (!baseRequest) {
    return (
      <div className="panel-card request-compare-card request-compare-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('requestCompare.emptySelection')} />
      </div>
    )
  }

  return (
    <div className="panel-card request-compare-card">
      <div className="request-compare-header">
        <div>
          <Typography.Text className="panel-section-eyebrow">Compare</Typography.Text>
          <Typography.Title level={5} className="request-compare-title">
            Request / Reply Diff
          </Typography.Title>
        </div>
        <Select
          size="small"
          className="request-compare-select"
          allowClear
          value={selectedReplayRequestId}
          style={{ width: 240 }}
          placeholder={replayRequests.length > 0 ? t('requestCompare.selectReplay') : t('requestCompare.noReplayRecords')}
          disabled={replayRequests.length === 0}
          options={replayRequests.map((item) => ({
            value: item.id,
            label: `${new Date(item.receivedAt).toLocaleTimeString()} · ${item.requestStatus ?? t('requestPanel.pending')}`,
          }))}
          onChange={setSelectedReplayRequestId}
        />
      </div>

      <div className="request-compare-body">
        <div className="request-compare-summary-grid">
          <CompareSummary title={t('requestCompare.originalRequest')} requestMessage={baseRequest} responseMessage={baseResponse} />
          <CompareSummary title={t('requestCompare.replayRequest')} requestMessage={selectedReplayRequest} responseMessage={replayResponse} />
          <div className="compare-summary-card">
            <div className="compare-summary-head">
              <Typography.Title level={5} className="compare-summary-title">
                {t('requestCompare.responseResult')}
              </Typography.Title>
            </div>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <div className="compare-summary-row">
                <Typography.Text type="secondary">{t('requestCompare.originalRequest')}</Typography.Text>
                <Tag color={statusColor(baseResponse?.requestStatus ?? baseRequest.requestStatus)}>
                  {baseResponse?.requestStatus ?? baseRequest.requestStatus ?? t('requestCompare.unknown')}
                </Tag>
              </div>
              <Typography.Text type="secondary">
                {baseResponse?.payload ? `${payloadFormat(baseResponse.payload)} · ${baseResponse.payload.length} bytes` : baseRequest.errorMessage ?? t('requestCompare.noResponseShort')}
              </Typography.Text>
              <div className="compare-summary-row">
                <Typography.Text type="secondary">{t('requestCompare.replayRequest')}</Typography.Text>
                <Tag color={statusColor(replayResponse?.requestStatus ?? selectedReplayRequest?.requestStatus)}>
                  {replayResponse?.requestStatus ?? selectedReplayRequest?.requestStatus ?? t('requestCompare.notSelected')}
                </Tag>
              </div>
              <Typography.Text type="secondary">
                {replayResponse?.payload
                  ? `${payloadFormat(replayResponse.payload)} · ${replayResponse.payload.length} bytes`
                  : selectedReplayRequest?.errorMessage ?? t('requestCompare.noReplayResponse')}
              </Typography.Text>
            </Space>
          </div>
        </div>

        <div className="compare-section compare-diff-card">
          <div className="compare-section-head">
            <Typography.Title level={5}>{t('requestCompare.requestBodyDiff')}</Typography.Title>
            <Tag>{t('requestCompare.changedCount', { count: buildTextDiffRows(baseRequest.payload, selectedReplayRequest?.payload).filter((item) => item.status === 'changed').length })}</Tag>
          </div>
          <Table
            size="small"
            rowKey="key"
            columns={textDiffColumns}
            dataSource={buildTextDiffRows(baseRequest.payload, selectedReplayRequest?.payload)}
            pagination={false}
            rowClassName={(record) => (record.status === 'changed' ? 'diff-row-changed' : '')}
          />
        </div>

        <div className="compare-section compare-diff-card">
          <div className="compare-section-head">
            <Typography.Title level={5}>{t('requestCompare.requestHeaderDiff')}</Typography.Title>
            <Tag>{t('requestCompare.headerCount', { count: buildHeaderDiffRows(baseRequest.headers, selectedReplayRequest?.headers).length })}</Tag>
          </div>
          <Table
            size="small"
            rowKey="key"
            columns={headerDiffColumns}
            dataSource={buildHeaderDiffRows(baseRequest.headers, selectedReplayRequest?.headers)}
            pagination={false}
            rowClassName={(record) => `diff-row-${record.status}`}
          />
        </div>

        <div className="compare-section compare-diff-card">
          <div className="compare-section-head">
            <Typography.Title level={5}>{t('requestCompare.responseDiff')}</Typography.Title>
            <Tag>
              {t('requestCompare.changedCount', {
                count: buildTextDiffRows(
                  buildResponseViewValue(baseRequest, baseResponse, t),
                  buildResponseViewValue(selectedReplayRequest, replayResponse, t),
                ).filter((item) => item.status === 'changed').length,
              })}
            </Tag>
          </div>
          <Table
            size="small"
            rowKey="key"
            columns={textDiffColumns}
            dataSource={buildTextDiffRows(
              buildResponseViewValue(baseRequest, baseResponse, t),
              buildResponseViewValue(selectedReplayRequest, replayResponse, t),
            )}
            pagination={false}
            rowClassName={(record) => (record.status === 'changed' ? 'diff-row-changed' : '')}
          />
        </div>
      </div>
    </div>
  )
}
