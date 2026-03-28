import {
  DownloadOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Input, Modal, Popover, Space, Switch, Tag, Typography } from 'antd'
import { useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type {
  ExportConnectionsFileResponse,
  ExportConnectionsRequest,
  ExportConnectionsResponse,
  ImportConnectionsFromFileRequest,
  ImportConnectionsRequest,
  ImportConnectionsResponse,
} from '../types'

interface ConnectionTransferActionsProps {
  onExport: (request: ExportConnectionsRequest) => Promise<ExportConnectionsResponse>
  onExportToFile: (request: ExportConnectionsRequest) => Promise<ExportConnectionsFileResponse>
  onImport: (request: ImportConnectionsRequest) => Promise<ImportConnectionsResponse>
  onImportFromFile: (request: ImportConnectionsFromFileRequest) => Promise<ImportConnectionsResponse>
  variant?: 'buttons' | 'popover'
  trigger?: ReactNode
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function ConnectionTransferActions({
  onExport,
  onExportToFile,
  onImport,
  onImportFromFile,
  variant = 'buttons',
  trigger,
}: ConnectionTransferActionsProps) {
  const { message } = AntdApp.useApp()
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [overwrite, setOverwrite] = useState(true)
  const [maskSensitive, setMaskSensitive] = useState(false)
  const [content, setContent] = useState('')
  const [exportContent, setExportContent] = useState('')
  const [exportCount, setExportCount] = useState(0)
  const [exportMasked, setExportMasked] = useState(false)

  const formatImportMessage = (result: ImportConnectionsResponse) =>
    t('transfer.importMessage', {
      imported: result.imported,
      skipped: result.skipped ? t('transfer.skipped', { count: result.skipped }) : '',
    })

  const handleOpenExport = async () => {
    setExporting(true)
    try {
      const response = await onExport({ maskSensitive })
      setExportContent(response.content)
      setExportCount(response.count)
      setExportMasked(response.masked)
      setExportOpen(true)
      setPopoverOpen(false)
    } finally {
      setExporting(false)
    }
  }

  const handleSaveExportFile = async () => {
    try {
      const response = await onExportToFile({ maskSensitive })
      setExportCount(response.count)
      setExportMasked(response.masked)
      setExportOpen(false)
      setPopoverOpen(false)
      message.success(response.path ? t('transfer.exportSuccess', { path: response.path }) : t('transfer.exportFile'))
      return response
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message.toLowerCase() : ''
      if (nextMessage.includes('canceled')) {
        return { path: '', count: exportCount, masked: exportMasked }
      }

      const fallback = await onExport({ maskSensitive })
      downloadTextFile(
        fallback.masked ? 'natsx-connections-masked.json' : 'natsx-connections.json',
        fallback.content,
      )
      setExportOpen(false)
      setPopoverOpen(false)
      message.success(t('transfer.browserFallback'))
      return { path: 'browser-download', count: fallback.count, masked: fallback.masked }
    }
  }

  const handleImport = async () => {
    const result = await onImport({ content, overwrite })
    setImportOpen(false)
    setContent('')
    setPopoverOpen(false)
    message.success(formatImportMessage(result))
  }

  const handleImportFromFile = async () => {
    try {
      const result = await onImportFromFile({ overwrite })
      setPopoverOpen(false)
      message.success(formatImportMessage(result))
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message.toLowerCase() : ''
      if (nextMessage.includes('canceled')) {
        return
      }
      fileInputRef.current?.click()
    }
  }

  const openImportJson = () => {
    setImportOpen(true)
    setPopoverOpen(false)
  }

  const actions = [
    {
      key: 'preview-export',
      icon: <EyeOutlined />,
      title: t('transfer.previewExport'),
      desc: t('transfer.previewExportDesc'),
      loading: exporting,
      onClick: () => void handleOpenExport(),
    },
    {
      key: 'export-file',
      icon: <DownloadOutlined />,
      title: t('transfer.exportFile'),
      desc: t('transfer.exportFileDesc'),
      loading: exporting,
      onClick: () => void handleSaveExportFile(),
    },
    {
      key: 'import-json',
      icon: <UploadOutlined />,
      title: t('transfer.importJson'),
      desc: t('transfer.importJsonDesc'),
      loading: false,
      onClick: openImportJson,
    },
    {
      key: 'import-file',
      icon: <FolderOpenOutlined />,
      title: t('transfer.importFile'),
      desc: t('transfer.importFileDesc'),
      loading: importing,
      onClick: () => void handleImportFromFile(),
    },
  ]

  const actionButtons = (
    <Space wrap style={{ width: '100%' }} className="connection-transfer-actions">
      <Button onClick={() => void handleOpenExport()} loading={exporting}>
        {t('transfer.previewExport')}
      </Button>
      <Button onClick={() => void handleSaveExportFile()} loading={exporting}>
        {t('transfer.exportFile')}
      </Button>
      <Button onClick={openImportJson}>{t('transfer.importJson')}</Button>
      <Button onClick={() => void handleImportFromFile()} loading={importing}>
        {t('transfer.importFile')}
      </Button>
    </Space>
  )

  const popoverContent = (
    <div className="connection-transfer-popover">
      <Typography.Text className="panel-section-eyebrow">{t('transfer.transfer')}</Typography.Text>
      <Typography.Text className="connection-transfer-popover-caption">{t('transfer.caption')}</Typography.Text>
      <div className="connection-transfer-menu">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="text"
            className="connection-transfer-menu-item"
            loading={action.loading}
            onClick={action.onClick}
          >
            <span className="connection-transfer-menu-icon">{action.icon}</span>
            <span className="connection-transfer-menu-copy">
              <span className="connection-transfer-menu-title">{action.title}</span>
              <span className="connection-transfer-menu-desc">{action.desc}</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {variant === 'popover' ? (
        <Popover
          trigger="click"
          placement="bottomRight"
          overlayClassName="connection-transfer-popover-overlay"
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          content={popoverContent}
        >
          {trigger}
        </Popover>
      ) : (
        actionButtons
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }
          setImporting(true)
          try {
            const nextContent = await file.text()
            const result = await onImport({ content: nextContent, overwrite })
            setPopoverOpen(false)
            message.success(formatImportMessage(result))
          } finally {
            setImporting(false)
            event.target.value = ''
          }
        }}
      />

      <Modal
        open={exportOpen}
        title={t('transfer.previewTitle')}
        width={760}
        okText={t('transfer.copyJson')}
        cancelText={t('transfer.close')}
        onCancel={() => setExportOpen(false)}
        onOk={async () => {
          await navigator.clipboard.writeText(exportContent)
          setExportOpen(false)
          message.success(t('transfer.copied'))
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text className="panel-section-eyebrow">{t('transfer.exportFile')}</Typography.Text>
          <Space wrap>
            <Tag color="blue">{exportCount}</Tag>
            {exportMasked ? <Tag color="gold">{t('transfer.masked')}</Tag> : <Tag color="green">{t('transfer.raw')}</Tag>}
          </Space>
          <Typography.Text type="secondary">{t('transfer.exportDesc')}</Typography.Text>
          <Space wrap>
            <Typography.Text>{t('transfer.maskSensitive')}</Typography.Text>
            <Switch checked={maskSensitive} onChange={setMaskSensitive} />
            <Button size="small" onClick={() => void handleOpenExport()} loading={exporting}>
              {t('transfer.regenerate')}
            </Button>
            <Button size="small" onClick={() => void handleSaveExportFile()} loading={exporting}>
              {t('transfer.saveToFile')}
            </Button>
          </Space>
          <Input.TextArea value={exportContent} rows={18} readOnly />
        </Space>
      </Modal>

      <Modal
        open={importOpen}
        title={t('transfer.importTitle')}
        width={760}
        okText={t('transfer.startImport')}
        cancelText={t('connectionEditor.cancel')}
        confirmLoading={importing}
        onCancel={() => setImportOpen(false)}
        onOk={async () => {
          setImporting(true)
          try {
            await handleImport()
          } finally {
            setImporting(false)
          }
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text className="panel-section-eyebrow">{t('transfer.importJson')}</Typography.Text>
          <Space wrap>
            <Typography.Text>{t('transfer.overwrite')}</Typography.Text>
            <Switch checked={overwrite} onChange={setOverwrite} />
          </Space>
          <Typography.Text type="secondary">{t('transfer.importDesc')}</Typography.Text>
          <Input.TextArea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={18}
            placeholder='[
  {
    "name": "Local NATS",
    "url": "nats://127.0.0.1:4222",
    "authMode": "none"
  }
]'
          />
        </Space>
      </Modal>
    </>
  )
}
