import { ClockCircleOutlined, HistoryOutlined, SendOutlined } from '@ant-design/icons'
import { App as AntdApp, Alert, Button, Card, Form, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord, RequestMessageResponse } from '../types'
import { formatHeaders, parseHeaderText } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import {
  formatJsonPayload,
  payloadModeOptions,
  preparePayloadForTransport,
  supportsStructuredFormatting,
} from '../utils/payload'

const requestIdHeader = 'X-NatsX-Request-Id'

interface RequestPanelProps {
  disabled: boolean
  recentRequests: MessageRecord[]
  onRequest: (payload: {
    subject: string
    payload: string
    payloadBase64?: string
    payloadEncoding: PayloadMode
    timeoutMs: number
    requestId?: string
    headers?: Record<string, string>
  }) => Promise<RequestMessageResponse>
}

interface RequestValues {
  subject: string
  payload: string
  payloadMode: PayloadMode
  timeoutMs: number
  requestId?: string
  headerText?: string
}

function toEditableHeaders(headers?: Record<string, string[]>) {
  if (!headers || Object.keys(headers).length === 0) {
    return ''
  }

  return Object.entries(headers)
    .filter(([key]) => key.toLowerCase() !== requestIdHeader.toLowerCase())
    .map(([key, values]) => `${key}: ${values.join(', ')}`)
    .join('\n')
}

function toPayloadMode(value?: string): PayloadMode {
  switch (value) {
    case 'json':
    case 'base64':
    case 'hex':
    case 'cbor':
    case 'msgpack':
      return value
    default:
      return 'text'
  }
}

function tryPrettyPayload(value?: string) {
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

export function RequestPanel({ disabled, recentRequests, onRequest }: RequestPanelProps) {
  const { message } = AntdApp.useApp()
  const { t } = useI18n()
  const [form] = Form.useForm<RequestValues>()
  const [latestResponse, setLatestResponse] = useState<RequestMessageResponse>()
  const [latestFailure, setLatestFailure] = useState<{
    subject: string
    requestId?: string
    timeoutMs: number
    message: string
  }>()

  const requestOptions = useMemo(
    () =>
      recentRequests.map((item) => ({
        value: item.id,
        label: `${item.subject} · ${item.requestStatus === 'failed' ? t('requestPanel.reusableFailed') : t('requestPanel.reusableReplay')} · ${new Date(item.receivedAt).toLocaleTimeString()}`,
      })),
    [recentRequests, t],
  )

  return (
    <Card className="panel-card request-panel-card" bodyStyle={{ padding: 0 }} title={null}>
      <div className="request-panel-header">
        <div>
          <Typography.Text className="panel-section-eyebrow">Request / Reply</Typography.Text>
          <Typography.Title level={5} className="request-panel-title">
            {t('requestPanel.debugger')}
          </Typography.Title>
        </div>
        <Tag icon={<HistoryOutlined />}>{t('requestPanel.records', { count: recentRequests.length })}</Tag>
      </div>

      <div className="request-panel-body">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            subject: 'rpc.health.check',
            payload: '{\n  "service": "orders"\n}',
            payloadMode: 'json',
            timeoutMs: 5000,
            requestId: '',
          }}
          onFinish={async (values) => {
            let preparedPayload
            try {
              preparedPayload = preparePayloadForTransport(values.payload, values.payloadMode)
            } catch (error) {
              const nextError = error instanceof Error ? error.message : t('requestPanel.invalidPayload', { mode: values.payloadMode.toUpperCase() })
              message.error(nextError)
              return
            }

            try {
              const response = await onRequest({
                subject: values.subject,
                payload: preparedPayload.payload,
                payloadBase64: preparedPayload.payloadBase64,
                payloadEncoding: preparedPayload.payloadEncoding,
                timeoutMs: values.timeoutMs,
                requestId: values.requestId?.trim() || undefined,
                headers: parseHeaderText(values.headerText),
              })

              setLatestResponse(response)
              setLatestFailure(undefined)
              form.setFieldValue('payload', preparedPayload.payload)
            } catch (error) {
              setLatestResponse(undefined)
              setLatestFailure({
                subject: values.subject,
                requestId: values.requestId?.trim() || undefined,
                timeoutMs: values.timeoutMs,
                message: error instanceof Error ? error.message : t('requestPanel.requestFailed'),
              })
            }
          }}
        >
          <Form.Item label={t('requestPanel.quickFill')}>
            <Select
              size="small"
              allowClear
              showSearch
              disabled={disabled || requestOptions.length === 0}
              placeholder={requestOptions.length > 0 ? t('requestPanel.quickFillPlaceholder') : t('requestPanel.noReusableRequests')}
              options={requestOptions}
              onChange={(value) => {
                const selected = recentRequests.find((item) => item.id === value)
                if (!selected) {
                  return
                }

                form.setFieldsValue({
                  subject: selected.subject,
                  payload: selected.payload,
                  payloadMode: toPayloadMode(selected.payloadEncoding),
                  timeoutMs: selected.requestTimeoutMs || 5000,
                  requestId: '',
                  headerText: toEditableHeaders(selected.headers),
                })
              }}
            />
          </Form.Item>

          <Form.Item name="subject" label="Request Subject" rules={[{ required: true, message: t('requestPanel.requestSubjectRequired') }]}>
            <Input placeholder="rpc.health.check" size="small" disabled={disabled} />
          </Form.Item>

          <div className="request-panel-toolbar">
            <Form.Item name="payloadMode" className="compact-form-item">
              <Select className="request-toolbar-select" style={{ width: 116 }} size="small" options={payloadModeOptions} />
            </Form.Item>
            <Form.Item name="timeoutMs" className="compact-form-item">
              <InputNumber
                min={250}
                step={250}
                size="small"
                className="request-timeout-input"
                disabled={disabled}
                style={{ width: 122 }}
                addonAfter={<ClockCircleOutlined />}
              />
            </Form.Item>
            <Button
              size="small"
              className="request-format-button"
              disabled={disabled}
              onClick={() => {
                try {
                  const payloadMode = form.getFieldValue('payloadMode')
                if (!supportsStructuredFormatting(payloadMode)) {
                  return
                }
                form.setFieldValue('payload', formatJsonPayload(form.getFieldValue('payload') || ''))
              } catch {
                  message.error(t('requestPanel.invalidJson'))
              }
            }}
          >
              {t('requestPanel.formatLabel')}
            </Button>
          </div>

          <Form.Item name="payload" label="Payload" rules={[{ required: true, message: t('requestPanel.payloadRequired') }]}>
            <Input.TextArea rows={10} disabled={disabled} className="request-editor-textarea" />
          </Form.Item>

          <Form.Item name="headerText" label="Headers">
            <Input.TextArea rows={2} placeholder={'x-request-id: req-001'} disabled={disabled} className="request-header-textarea" />
          </Form.Item>

          <div className="request-form-footer">
            <Form.Item name="requestId" className="compact-form-item request-id-form-item">
              <Input placeholder={t('requestPanel.requestIdPlaceholder')} size="small" disabled={disabled} />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="middle"
              className="request-submit-button"
              disabled={disabled}
              icon={<SendOutlined />}
            >
              {t('requestPanel.sendRequest')}
            </Button>
          </div>
        </Form>
      </div>

      {latestFailure ? (
        <div className="request-panel-feedback">
          <Alert
            className="request-feedback-card"
            type="error"
            showIcon
            message={t('requestPanel.requestFailedFor', { subject: latestFailure.subject })}
            description={
              <Space direction="vertical" size={6}>
                <Typography.Text>{latestFailure.message}</Typography.Text>
                <Space wrap>
                  {latestFailure.requestId ? <Tag color="error">{latestFailure.requestId}</Tag> : null}
                  <Tag color="warning">{t('requestPanel.timeout', { timeout: latestFailure.timeoutMs })}</Tag>
                </Space>
              </Space>
            }
          />
        </div>
      ) : null}

      {latestResponse ? (
        <div className="request-panel-feedback">
          <Card size="small" className="request-feedback-card">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div className="request-response-head">
                <Space wrap>
                  <Tag color="cyan">{t('requestPanel.response')}</Tag>
                  <Typography.Text strong>{latestResponse.message.subject}</Typography.Text>
                  {latestResponse.message.correlationId ? <Tag>{latestResponse.message.correlationId}</Tag> : null}
                  {latestResponse.message.requestDurationMs ? (
                    <Tag color="processing">{latestResponse.message.requestDurationMs} ms</Tag>
                  ) : null}
                </Space>
                <Typography.Text type="secondary">
                  {new Date(latestResponse.message.receivedAt).toLocaleTimeString()}
                </Typography.Text>
              </div>

              <pre className="message-pre request-response-pre">{tryPrettyPayload(latestResponse.message.payload)}</pre>

              <div className="request-response-meta">
                <Typography.Text type="secondary">Headers</Typography.Text>
                <pre className="message-pre request-response-header-pre">
                  {formatHeaders(latestResponse.message.headers) || t('requestPanel.noHeaders')}
                </pre>
              </div>
            </Space>
          </Card>
        </div>
      ) : null}
    </Card>
  )
}
