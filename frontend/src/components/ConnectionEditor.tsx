import { InfoCircleOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Card, Form, Input, Modal, Select, Space, Tooltip, Typography } from 'antd'
import type { FormInstance } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import { backend } from '../services/backend'
import type {
  ConnectionAuthMode,
  ConnectionInput,
  ConnectionProfile,
  ManagedResourceFile,
} from '../types'

interface ConnectionEditorProps {
  open: boolean
  initialValue?: ConnectionProfile
  onCancel: () => void
  onSubmit: (value: ConnectionInput) => Promise<void>
}

interface ConnectionEditorPageProps {
  initialValue?: ConnectionProfile
  onBack?: () => void
  onSubmit: (value: ConnectionInput) => Promise<void>
}

interface ConnectionPreset {
  key: string
  label: string
  description: string
  values: Partial<ConnectionInput>
}

interface ManagedFileFieldProps {
  form: FormInstance<ConnectionInput>
  fieldName: 'credsFile' | 'certFile' | 'keyFile' | 'caFile'
  label: string
  placeholder: string
  required?: boolean
  requiredMessage?: string
  extra?: string
  listFiles: () => Promise<ManagedResourceFile[]>
  importFile: () => Promise<ManagedResourceFile>
}

function inferAuthMode(initialValue?: ConnectionProfile): ConnectionAuthMode {
  if (!initialValue) {
    return 'none'
  }
  if (initialValue.authMode) {
    return initialValue.authMode
  }
  if (initialValue.credsFile) {
    return 'creds'
  }
  if (initialValue.nkeyOrSeed) {
    return 'nkey'
  }
  if (initialValue.token) {
    return 'token'
  }
  if (initialValue.username || initialValue.password) {
    return 'user'
  }
  if (initialValue.certFile || initialValue.keyFile || initialValue.caFile) {
    return 'tls'
  }
  return 'none'
}

function buildFormValues(initialValue?: ConnectionProfile): ConnectionInput {
  return {
    id: initialValue?.id,
    name: initialValue?.name ?? '',
    url: initialValue?.url ?? 'nats://127.0.0.1:4222',
    authMode: inferAuthMode(initialValue),
    username: initialValue?.username,
    password: initialValue?.password,
    token: initialValue?.token,
    certFile: initialValue?.certFile,
    keyFile: initialValue?.keyFile,
    caFile: initialValue?.caFile,
    nkeyOrSeed: initialValue?.nkeyOrSeed,
    credsFile: initialValue?.credsFile,
    group: initialValue?.group,
    description: initialValue?.description,
  }
}

function useSyncForm(open: boolean, form: FormInstance<ConnectionInput>, initialValue?: ConnectionProfile) {
  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue(buildFormValues(initialValue))
  }, [form, initialValue, open])
}

function buildManagedOptions(files: ManagedResourceFile[], currentPath?: string) {
  const mapped = files.map((file) => ({
    value: file.path,
    label: file.name,
    title: file.path,
  }))

  if (currentPath && !mapped.some((item) => item.value === currentPath)) {
    mapped.unshift({
      value: currentPath,
      label: currentPath.split(/[\\/]/).pop() || currentPath,
      title: currentPath,
    })
  }

  return mapped
}

function ManagedFieldLabel({ label, currentPath }: { label: string; currentPath?: string }) {
  const { t } = useI18n()
  return (
    <Space size={6}>
      <span>{label}</span>
      {currentPath ? (
        <Tooltip title={`${t('connectionEditor.currentFile')}：${currentPath}`}>
          <InfoCircleOutlined />
        </Tooltip>
      ) : null}
    </Space>
  )
}

function ManagedFileField({
  form,
  fieldName,
  label,
  placeholder,
  required,
  requiredMessage,
  extra,
  listFiles,
  importFile,
}: ManagedFileFieldProps) {
  const { message } = AntdApp.useApp()
  const { t } = useI18n()
  const currentPath = Form.useWatch(fieldName, form)
  const [files, setFiles] = useState<ManagedResourceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const nextFiles = await listFiles()
      setFiles(nextFiles)
      return nextFiles
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('connectionEditor.listFailed', { label }))
      return []
    } finally {
      setLoading(false)
    }
  }, [label, listFiles, message])

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const file = await importFile()
      setFiles((current) => [file, ...current.filter((item) => item.path !== file.path)])
      form.setFieldValue(fieldName, file.path)
      if (file.reused) {
        message.info(t('connectionEditor.importReused', { name: file.name }))
      } else {
        message.success(t('connectionEditor.importSuccess', { name: file.name }))
      }
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(t('connectionEditor.importFailed'))
      if (!/canceled/i.test(nextError.message)) {
        message.error(nextError.message)
      }
    } finally {
      setImporting(false)
    }
  }, [fieldName, form, importFile, message])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const options = useMemo(() => buildManagedOptions(files, currentPath), [currentPath, files])

  return (
    <Form.Item
      label={<ManagedFieldLabel label={label} currentPath={currentPath} />}
      required={required}
      extra={extra}
    >
      <Space.Compact style={{ width: '100%' }}>
        <Tooltip title={currentPath}>
          <div style={{ width: '100%' }}>
            <Form.Item
              name={fieldName}
              noStyle
              rules={required ? [{ required: true, message: requiredMessage ?? t('connectionEditor.selectRequired', { label }) }] : undefined}
            >
              <Select
                showSearch
                allowClear={!required}
                placeholder={placeholder}
                options={options}
                loading={loading}
                optionFilterProp="label"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>
        </Tooltip>
        <Button icon={<UploadOutlined />} loading={importing} onClick={() => void handleImport()}>
          {t('connectionEditor.upload')}
        </Button>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadFiles()}>
          {t('connectionEditor.refresh')}
        </Button>
      </Space.Compact>
    </Form.Item>
  )
}

function ConnectionEditorFields({ form }: { form: FormInstance<ConnectionInput> }) {
  const { t } = useI18n()
  const authMode = Form.useWatch('authMode', form) ?? 'none'
  const connectionPresets: ConnectionPreset[] = [
    {
      key: 'local',
      label: t('connectionEditor.presets.localLabel'),
      description: t('connectionEditor.presets.localDesc'),
      values: {
        name: 'Local NATS',
        url: 'nats://127.0.0.1:4222',
        authMode: 'none',
        description: t('connectionEditor.presets.localLabel'),
      },
    },
    {
      key: 'remote-user',
      label: t('connectionEditor.presets.remoteUserLabel'),
      description: t('connectionEditor.presets.remoteUserDesc'),
      values: {
        name: 'Remote Auth NATS',
        url: 'nats://101.96.230.251:14222',
        authMode: 'user',
        username: 'admin',
        password: '',
        description: t('connectionEditor.presets.remoteUserLabel'),
      },
    },
    {
      key: 'remote-open',
      label: t('connectionEditor.presets.remoteOpenLabel'),
      description: t('connectionEditor.presets.remoteOpenDesc'),
      values: {
        name: 'Remote NoAuth NATS',
        url: 'nats://172.22.211.22:4222',
        authMode: 'none',
        description: t('connectionEditor.presets.remoteOpenLabel'),
      },
    },
  ]

  const applyPreset = (presetKey: string) => {
    const preset = connectionPresets.find((item) => item.key === presetKey)
    if (!preset) {
      return
    }

    form.setFieldsValue({
      ...form.getFieldsValue(),
      ...preset.values,
    })
  }

  return (
    <>
      <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
        <Typography.Text className="panel-section-eyebrow">{t('connectionEditor.connectionProfile')}</Typography.Text>
        <Typography.Text type="secondary">
          {t('connectionEditor.description')}
        </Typography.Text>
      </Space>

      <Form
        form={form}
        layout="horizontal"
        labelAlign="left"
        labelWrap
        className="connection-editor-form"
        labelCol={{ flex: '140px' }}
        wrapperCol={{ flex: 'auto' }}
      >
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>

        <Form.Item label={t('connectionEditor.quickTemplate')}>
          <Select
            placeholder={t('connectionEditor.quickTemplatePlaceholder')}
            options={connectionPresets.map((item) => ({
              value: item.key,
              label: `${item.label} · ${item.description}`,
            }))}
            onChange={applyPreset}
            allowClear
          />
        </Form.Item>

        <Form.Item label={t('connectionEditor.connectionName')} name="name" rules={[{ required: true, message: t('connectionEditor.connectionNameRequired') }]}>
          <Input placeholder={t('connectionEditor.connectionNamePlaceholder')} />
        </Form.Item>

        <Form.Item label={t('connectionEditor.connectionUrl')} name="url" rules={[{ required: true, message: t('connectionEditor.connectionUrlRequired') }]}>
          <Input placeholder={t('connectionEditor.connectionUrlPlaceholder')} />
        </Form.Item>

        <Form.Item label={t('connectionEditor.authMode')} name="authMode">
          <Select
            options={[
              { value: 'none', label: t('connectionEditor.noAuth') },
              { value: 'user', label: t('connectionEditor.userPassword') },
              { value: 'token', label: t('connectionEditor.token') },
              { value: 'tls', label: t('connectionEditor.tls') },
              { value: 'nkey', label: t('connectionEditor.nkey') },
              { value: 'creds', label: t('connectionEditor.credentials') },
            ]}
          />
        </Form.Item>

        {authMode === 'user' ? (
          <>
            <Form.Item label={t('connectionEditor.username')} name="username" rules={[{ required: true, message: t('connectionEditor.usernameRequired') }]}>
              <Input placeholder={t('connectionEditor.usernamePlaceholder')} />
            </Form.Item>
            <Form.Item label={t('connectionEditor.password')} name="password">
              <Input.Password placeholder={t('connectionEditor.passwordPlaceholder')} />
            </Form.Item>
          </>
        ) : null}

        {authMode === 'token' ? (
          <Form.Item label={t('connectionEditor.token')} name="token" rules={[{ required: true, message: t('connectionEditor.tokenRequired') }]}>
            <Input.Password placeholder={t('connectionEditor.tokenPlaceholder')} />
          </Form.Item>
        ) : null}

        {authMode === 'nkey' ? (
          <Form.Item label={t('connectionEditor.nkeySeed')} name="nkeyOrSeed" rules={[{ required: true, message: t('connectionEditor.nkeySeedRequired') }]}>
            <Input.Password placeholder={t('connectionEditor.nkeySeedPlaceholder')} />
          </Form.Item>
        ) : null}

        {authMode === 'creds' ? (
          <ManagedFileField
            form={form}
            fieldName="credsFile"
            label={t('connectionEditor.credentialsLabel')}
            placeholder={t('connectionEditor.credentialsPlaceholder')}
            required
            requiredMessage={t('connectionEditor.credentialsRequired')}
            extra={t('connectionEditor.credentialsExtra')}
            listFiles={backend.listCredentialsFiles}
            importFile={backend.importCredentialsFile}
          />
        ) : null}

        {authMode === 'tls' ? (
          <>
            <ManagedFileField
              form={form}
              fieldName="certFile"
              label={t('connectionEditor.certLabel')}
              placeholder={t('connectionEditor.certPlaceholder')}
              extra={t('connectionEditor.certExtra')}
              listFiles={backend.listTLSCertFiles}
              importFile={backend.importTLSCertFile}
            />
            <ManagedFileField
              form={form}
              fieldName="keyFile"
              label={t('connectionEditor.keyLabel')}
              placeholder={t('connectionEditor.keyPlaceholder')}
              extra={t('connectionEditor.keyExtra')}
              listFiles={backend.listTLSKeyFiles}
              importFile={backend.importTLSKeyFile}
            />
            <ManagedFileField
              form={form}
              fieldName="caFile"
              label={t('connectionEditor.caLabel')}
              placeholder={t('connectionEditor.caPlaceholder')}
              extra={t('connectionEditor.caExtra')}
              listFiles={backend.listTLSCAFiles}
              importFile={backend.importTLSCAFile}
            />
            <Form.Item
              noStyle
              dependencies={['certFile', 'keyFile']}
              rules={[
                {
                  validator: async () => {
                    const certFile = form.getFieldValue('certFile')
                    const keyFile = form.getFieldValue('keyFile')
                    if ((certFile && !keyFile) || (!certFile && keyFile)) {
                      throw new Error(t('connectionEditor.tlsPairRequired'))
                    }
                  },
                },
              ]}
            >
              <Input hidden />
            </Form.Item>
            <Typography.Text type="secondary">
              {t('connectionEditor.tlsHint')}
            </Typography.Text>
          </>
        ) : null}

        <Form.Item label={t('connectionEditor.group')} name="group">
          <Input placeholder={t('connectionEditor.groupPlaceholder')} />
        </Form.Item>

        <Form.Item label={t('connectionEditor.notes')} name="description">
          <Input.TextArea rows={3} placeholder={t('connectionEditor.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </>
  )
}

export function ConnectionEditor({ open, initialValue, onCancel, onSubmit }: ConnectionEditorProps) {
  const { t } = useI18n()
  const [form] = Form.useForm<ConnectionInput>()
  useSyncForm(open, form, initialValue)

  return (
    <Modal
      open={open}
      title={initialValue ? t('connectionEditor.editConnection') : t('connectionEditor.newConnection')}
      okText={t('connectionEditor.save')}
      cancelText={t('connectionEditor.cancel')}
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields()
        await onSubmit(values)
        form.resetFields()
      }}
      destroyOnClose
    >
      <ConnectionEditorFields form={form} />
    </Modal>
  )
}

export function ConnectionEditorPage({ initialValue, onBack, onSubmit }: ConnectionEditorPageProps) {
  const { t } = useI18n()
  const [form] = Form.useForm<ConnectionInput>()
  useSyncForm(true, form, initialValue)

  return (
    <div className="connection-editor-page">
      <div className="connection-editor-page-header">
        <div>
          <Typography.Text className="panel-section-eyebrow">{t('connectionEditor.builder')}</Typography.Text>
          <Typography.Title level={2} className="page-title">
            {initialValue ? t('connectionEditor.editConnection') : t('connectionEditor.newConnection')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-description">
            {t('connectionEditor.builderDesc')}
          </Typography.Paragraph>
        </div>
        <Space>
          {onBack ? <Button onClick={onBack}>{t('connectionEditor.back')}</Button> : null}
          <Button
            type="primary"
            onClick={async () => {
              const values = await form.validateFields()
              await onSubmit(values)
            }}
          >
            {t('connectionEditor.saveConnection')}
          </Button>
        </Space>
      </div>

      <Card className="page-card connection-editor-page-card">
        <ConnectionEditorFields form={form} />
      </Card>
    </div>
  )
}
