import { App as AntdApp, Button, Form, Input, Modal, Select, Space, Typography } from 'antd'
import { useEffect } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord, ReplyRequest } from '../types'
import { parseHeaderText } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import {
  formatJsonPayload,
  payloadModeOptions,
  preparePayloadForTransport,
  supportsStructuredFormatting,
} from '../utils/payload'

interface ReplyComposerProps {
  open: boolean
  message?: MessageRecord
  onCancel: () => void
  onSubmit: (payload: ReplyRequest) => Promise<void>
  connectionId?: string
}

interface ReplyValues {
  replySubject: string
  payload: string
  payloadMode: PayloadMode
  headerText?: string
}

export function ReplyComposer({ open, message, onCancel, onSubmit, connectionId }: ReplyComposerProps) {
  const { message: toast } = AntdApp.useApp()
  const { t } = useI18n()
  const [form] = Form.useForm<ReplyValues>()

  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue({
      replySubject: message?.reply ?? '',
      payload: '{\n  "ok": true\n}',
      payloadMode: 'json',
      headerText: '',
    })
  }, [form, message, open])

  return (
    <Modal
      className="reply-composer-modal publish-modal"
      open={open}
      okButtonProps={{ className: 'publish-modal-confirm-button' }}
      title={t('replyComposer.title')}
      okText={t('replyComposer.send')}
      cancelText={t('replyComposer.cancel')}
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields()
        if (!connectionId) {
          return
        }

        let preparedPayload
        try {
          preparedPayload = preparePayloadForTransport(values.payload, values.payloadMode)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('replyComposer.invalidPayload'))
          return
        }

        await onSubmit({
          connectionId,
          replySubject: values.replySubject,
          payload: preparedPayload.payload,
          payloadBase64: preparedPayload.payloadBase64,
          payloadEncoding: preparedPayload.payloadEncoding,
          headers: parseHeaderText(values.headerText),
          requestId: message?.correlationId,
          sourceMessageId: message?.id,
        })
        form.resetFields()
      }}
      destroyOnClose
    >
      <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 10 }}>
        <Typography.Text className="panel-section-eyebrow">{t('replyComposer.workflow')}</Typography.Text>
        {message ? (
          <>
            <Space wrap>
              <Typography.Text strong>{message.subject}</Typography.Text>
              {message.correlationId ? <Typography.Text code>{message.correlationId}</Typography.Text> : null}
              {message.subscriptionPattern ? (
                <Typography.Text type="secondary">{message.subscriptionPattern}</Typography.Text>
              ) : null}
            </Space>
            <Typography.Text type="secondary">
              {t('replyComposer.inheritRequestId')}
            </Typography.Text>
          </>
        ) : null}
      </Space>

      <Form form={form} layout="vertical">
        <Form.Item name="replySubject" label="Reply Subject" rules={[{ required: true, message: t('replyComposer.missingReplySubject') }]}>
          <Input size="small" disabled />
        </Form.Item>
        <Form.Item name="payload" label="Payload" rules={[{ required: true, message: t('replyComposer.payloadRequired') }]}>
          <Input.TextArea rows={7} className="reply-editor-textarea" />
        </Form.Item>
        <div className="payload-toolbar">
          <Form.Item name="payloadMode" label={t('replyComposer.formatLabel')} className="compact-form-item">
            <Select className="reply-toolbar-select" size="small" style={{ width: 112 }} options={payloadModeOptions} />
          </Form.Item>
          <Button
            size="small"
            className="reply-format-button"
            onClick={() => {
              try {
                const payloadMode = form.getFieldValue('payloadMode')
                if (!supportsStructuredFormatting(payloadMode)) {
                  return
                }
                form.setFieldValue('payload', formatJsonPayload(form.getFieldValue('payload') || ''))
              } catch {
                toast.error(t('replyComposer.invalidJson'))
              }
            }}
          >
            {t('replyComposer.formatJson')}
          </Button>
        </div>
        <Form.Item name="headerText" label="Headers">
          <Input.TextArea rows={2} placeholder={'content-type: application/json'} className="reply-header-textarea" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
