import { App as AntdApp, Button, Form, Input, Modal, Select, Switch, Typography } from 'antd'
import { useEffect } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type { MessageRecord, RepublishMessageRequest } from '../types'
import { formatHeaders, parseHeaderText } from '../utils/nats'
import type { PayloadMode } from '../utils/payload'
import {
  formatJsonPayload,
  payloadModeOptions,
  preparePayloadForTransport,
  supportsStructuredFormatting,
} from '../utils/payload'

interface RepublishComposerProps {
  open: boolean
  message?: MessageRecord
  onCancel: () => void
  onSubmit: (payload: RepublishMessageRequest) => Promise<unknown>
}

interface RepublishFormValues {
  subject: string
  payload: string
  payloadMode: PayloadMode
  headersText?: string
  useJetStream: boolean
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

export function RepublishComposer({ open, message, onCancel, onSubmit }: RepublishComposerProps) {
  const { message: toast } = AntdApp.useApp()
  const { t } = useI18n()
  const [form] = Form.useForm<RepublishFormValues>()

  useEffect(() => {
    if (!open || !message) {
      return
    }
    form.setFieldsValue({
      subject: message.subject,
      payload: message.payload,
      payloadMode: toPayloadMode(message.payloadEncoding),
      headersText: message.headers ? formatHeaders(message.headers) : undefined,
      useJetStream: message.jetStream,
    })
  }, [form, message, open])

  return (
    <Modal
      className="republish-composer-modal publish-modal"
      open={open}
      okButtonProps={{ className: 'publish-modal-confirm-button' }}
      title={t('republishComposer.title')}
      okText={t('republishComposer.publishNow')}
      cancelText={t('republishComposer.cancel')}
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields()
        if (!message) {
          return
        }

        let preparedPayload
        try {
          preparedPayload = preparePayloadForTransport(values.payload, values.payloadMode)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('republishComposer.invalidPayload'))
          return
        }

        await onSubmit({
          messageId: message.id,
          subject: values.subject,
          payload: preparedPayload.payload,
          payloadBase64: preparedPayload.payloadBase64,
          payloadEncoding: preparedPayload.payloadEncoding,
          headers: parseHeaderText(values.headersText),
          useJetStream: values.useJetStream,
        })
        form.resetFields()
      }}
      destroyOnClose
    >
      <Typography.Text className="panel-section-eyebrow">{t('republishComposer.title')}</Typography.Text>
      <Typography.Paragraph type="secondary">
        {t('republishComposer.description')}
      </Typography.Paragraph>

      <Form form={form} layout="vertical">
        <Form.Item name="subject" label={t('republishComposer.targetSubject')} rules={[{ required: true, message: t('republishComposer.targetSubjectRequired') }]}>
          <Input placeholder={t('republishComposer.targetSubjectPlaceholder')} />
        </Form.Item>
        <Form.Item name="payload" label="Payload" rules={[{ required: true, message: t('republishComposer.payloadRequired') }]}>
          <Input.TextArea rows={8} />
        </Form.Item>
        <div className="payload-toolbar">
          <Form.Item name="payloadMode" label={t('republishComposer.formatLabel')} className="compact-form-item">
            <Select className="republish-toolbar-select" style={{ width: 140 }} options={payloadModeOptions} />
          </Form.Item>
          <Button
            className="republish-format-button"
            onClick={() => {
              try {
                const payloadMode = form.getFieldValue('payloadMode')
                if (!supportsStructuredFormatting(payloadMode)) {
                  return
                }
                form.setFieldValue('payload', formatJsonPayload(form.getFieldValue('payload') || ''))
              } catch {
                toast.error(t('republishComposer.invalidJson'))
              }
            }}
          >
            {t('republishComposer.formatJson')}
          </Button>
        </div>
        <Form.Item name="headersText" label="Headers">
          <Input.TextArea rows={4} placeholder={'content-type: application/json'} className="republish-header-textarea" />
        </Form.Item>
        <Form.Item name="useJetStream" label={t('republishComposer.jetstreamPublish')} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
