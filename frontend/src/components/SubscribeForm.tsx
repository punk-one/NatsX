import {
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  List,
  Modal,
  Select,
  Typography,
  type MenuProps,
} from 'antd'
import { useMemo, useState } from 'react'

import type { SubscriptionInfo } from '../types'

interface SubscribeFormProps {
  disabled: boolean
  subscriptions: SubscriptionInfo[]
  selectedSubject?: string
  onSelectSubject?: (subject: string) => void
  onSubscribe: (payload: { subject: string; queueGroup?: string }) => Promise<void>
  onUpdateSubscription: (payload: {
    subscriptionId: string
    subject: string
    queueGroup?: string
  }) => Promise<SubscriptionInfo>
  onSetSubscriptionState: (payload: { subscriptionId: string; active: boolean }) => Promise<SubscriptionInfo>
}

interface SubscribeValues {
  subject: string
  queueGroup?: string
  aliasText?: string
  color?: string
}

interface EditSubscriptionValues {
  subject: string
  queueGroup?: string
  alias?: string
  color?: string
}

const topicColorOptions = [
  { value: '#ef4444', label: '\u7ea2\u8272' },
  { value: '#f97316', label: '\u6a59\u8272' },
  { value: '#eab308', label: '\u9ec4\u8272' },
  { value: '#22c55e', label: '\u7eff\u8272' },
  { value: '#06b6d4', label: '\u9752\u8272' },
  { value: '#3b82f6', label: '\u84dd\u8272' },
  { value: '#8b5cf6', label: '\u7d2b\u8272' },
  { value: '#ec4899', label: '\u7c89\u8272' },
]

const defaultTopicColor = topicColorOptions[5].value

function parseTopicList(value?: string) {
  return (value ?? '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function pickTopicColor(index: number) {
  return topicColorOptions[index % topicColorOptions.length].value
}

export function SubscribeForm({
  disabled,
  subscriptions,
  selectedSubject,
  onSelectSubject,
  onSubscribe,
  onUpdateSubscription,
  onSetSubscriptionState,
}: SubscribeFormProps) {
  const { message } = AntdApp.useApp()
  const [createForm] = Form.useForm<SubscribeValues>()
  const [editForm] = Form.useForm<EditSubscriptionValues>()
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({})
  const [topicColorMap, setTopicColorMap] = useState<Record<string, string>>({})
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionInfo>()

  const activeCount = useMemo(() => subscriptions.filter((item) => item.active).length, [subscriptions])

  const openEditModal = (subscription: SubscriptionInfo) => {
    if (disabled) {
      return
    }

    setEditingSubscription(subscription)
    editForm.setFieldsValue({
      subject: subscription.subject,
      queueGroup: subscription.queueGroup,
      alias: aliasMap[subscription.subject] ?? '',
      color: topicColorMap[subscription.subject] ?? defaultTopicColor,
    })
  }

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    const subjects = parseTopicList(values.subject)
    const aliases = parseTopicList(values.aliasText)

    if (subjects.length === 0) {
      message.warning('\u8bf7\u81f3\u5c11\u8f93\u5165\u4e00\u4e2a Subject')
      return
    }

    setCreateSaving(true)
    try {
      for (const subject of subjects) {
        await onSubscribe({
          subject,
          queueGroup: values.queueGroup?.trim() || undefined,
        })
      }

      setAliasMap((current) => {
        const nextMap = { ...current }
        subjects.forEach((subject, index) => {
          const alias = aliases[index]?.trim()
          if (alias) {
            nextMap[subject] = alias
          }
        })
        return nextMap
      })

      setTopicColorMap((current) => {
        const nextMap = { ...current }
        subjects.forEach((subject, index) => {
          nextMap[subject] = values.color || pickTopicColor(index)
        })
        return nextMap
      })

      createForm.resetFields()
      createForm.setFieldsValue({ color: defaultTopicColor })
      setCreateOpen(false)
      message.success(
        subjects.length > 1
          ? `\u5df2\u521b\u5efa ${subjects.length} \u4e2a\u8ba2\u9605`
          : '\u8ba2\u9605\u5df2\u521b\u5efa',
      )
    } finally {
      setCreateSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editingSubscription) {
      return
    }

    const values = await editForm.validateFields()
    setEditSaving(true)
    try {
      const updated = await onUpdateSubscription({
        subscriptionId: editingSubscription.id,
        subject: values.subject,
        queueGroup: values.queueGroup?.trim() || undefined,
      })

      setAliasMap((current) => {
        const nextMap = { ...current }
        const oldAlias = nextMap[editingSubscription.subject]

        if (editingSubscription.subject !== updated.subject) {
          delete nextMap[editingSubscription.subject]
          if (oldAlias && !values.alias?.trim()) {
            nextMap[updated.subject] = oldAlias
          }
        }

        if (values.alias?.trim()) {
          nextMap[updated.subject] = values.alias.trim()
        } else if (nextMap[updated.subject]) {
          delete nextMap[updated.subject]
        }

        return nextMap
      })

      setTopicColorMap((current) => {
        const nextMap = { ...current }
        const oldColor = nextMap[editingSubscription.subject]

        if (editingSubscription.subject !== updated.subject) {
          delete nextMap[editingSubscription.subject]
          if (oldColor && !values.color) {
            nextMap[updated.subject] = oldColor
          }
        }

        if (values.color) {
          nextMap[updated.subject] = values.color
        } else if (!nextMap[updated.subject]) {
          nextMap[updated.subject] = oldColor || defaultTopicColor
        }

        return nextMap
      })

      if (selectedSubject === editingSubscription.subject) {
        onSelectSubject?.(updated.subject)
      }

      setEditingSubscription(undefined)
      editForm.resetFields()
      message.success('\u8ba2\u9605\u5df2\u66f4\u65b0')
    } finally {
      setEditSaving(false)
    }
  }

  const handleToggleSubscription = async (subscription: SubscriptionInfo) => {
    if (disabled) {
      return
    }

    const next = await onSetSubscriptionState({
      subscriptionId: subscription.id,
      active: !subscription.active,
    })
    message.success(next.active ? '\u8ba2\u9605\u5df2\u542f\u7528' : '\u8ba2\u9605\u5df2\u505c\u7528')
  }

  return (
    <>
      <Card className="panel-card subscribe-panel-card" title={null} bodyStyle={{ padding: 0 }}>
        <div className="subscribe-create-bar subscribe-create-bar-top">
          <Button
            block
            size="large"
            type="primary"
            ghost
            icon={<PlusOutlined />}
            className="subscribe-create-button"
            disabled={disabled}
            onClick={() => setCreateOpen(true)}
          >
            {'\u65b0\u5efa\u8ba2\u9605'}
          </Button>
        </div>

        <div className="subscribe-panel-header subscribe-panel-header-compact subscribe-panel-subheader">
          <div className="subscribe-panel-header-copy" />
          <Typography.Text type="secondary" className="subscribe-panel-status">
            {`${activeCount}/${subscriptions.length} \u5df2\u542f\u7528`}
          </Typography.Text>
        </div>

        <List
            className="subscription-list natsx-topic-list"
          dataSource={subscriptions}
          locale={{
            emptyText: disabled
              ? '\u8bf7\u5148\u8fde\u63a5 NATS\uff0c\u7136\u540e\u65b0\u5efa\u8ba2\u9605'
              : '\u6682\u65e0\u8ba2\u9605',
          }}
          renderItem={(item, index) => {
            const alias = aliasMap[item.subject]
            const topicColor = topicColorMap[item.subject] ?? pickTopicColor(index)

            const menuItems: MenuProps['items'] = [
              {
                key: 'edit',
                icon: <EditOutlined />,
                label: 'Edit',
                disabled,
              },
              {
                key: 'toggle',
                icon: item.active ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
                label: item.active ? 'Disable' : 'Enable',
                disabled,
              },
            ]

            return (
              <Dropdown
                key={item.id}
                trigger={['contextMenu']}
                menu={{
                  items: menuItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation()
                    if (key === 'edit') {
                      openEditModal(item)
                    }
                    if (key === 'toggle') {
                      void handleToggleSubscription(item)
                    }
                  },
                }}
                overlayClassName="subscription-context-menu-overlay"
              >
                <List.Item
                    className={`natsx-topic-item ${selectedSubject === item.subject ? 'natsx-topic-item-active' : ''} ${
                      !item.active ? 'natsx-topic-item-paused' : ''
                    }`}
                  onClick={() => onSelectSubject?.(item.subject)}
                >
                  <div className="subscription-topic-layout">
                    <div className="subscription-topic-main">
                      <div className="subscription-topic-title-row">
                        <span className="topic-color-dot" style={{ backgroundColor: topicColor }} />
                        <Typography.Text strong className="clickable-subject subscription-topic-title">
                          {alias || item.subject}
                        </Typography.Text>
                      </div>
                      <div className="subscription-topic-meta">
                        {alias ? (
                          <Typography.Text type="secondary" className="subscription-topic-origin">
                            {item.subject}
                          </Typography.Text>
                        ) : null}
                        <Typography.Text type="secondary" className="subscription-topic-stat">
                          {item.active ? '\u8fd0\u884c\u4e2d' : '\u5df2\u505c\u7528'}
                        </Typography.Text>
                        {item.queueGroup ? (
                          <Typography.Text type="secondary" className="subscription-topic-stat">
                            {`\u961f\u5217\u7ec4 \u00b7 ${item.queueGroup}`}
                          </Typography.Text>
                        ) : null}
                        <Typography.Text type="secondary" className="subscription-topic-stat">
                          {`${item.messageCount} \u6761\u6d88\u606f`}
                        </Typography.Text>
                      </div>
                    </div>
                  </div>
                </List.Item>
              </Dropdown>
            )
          }}
        />
      </Card>

      <Modal
        open={createOpen}
        title={'\u65b0\u5efa\u8ba2\u9605'}
        okText={'\u521b\u5efa'}
        cancelText={'\u53d6\u6d88'}
        confirmLoading={createSaving}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
          createForm.setFieldsValue({ color: defaultTopicColor })
        }}
        onOk={() => void handleCreate()}
      >
        <Form form={createForm} layout="vertical" initialValues={{ color: defaultTopicColor }}>
          <Form.Item
            name="subject"
            label="Subject"
            rules={[{ required: true, message: '\u8bf7\u8f93\u5165 Subject' }]}
          >
            <Input.TextArea rows={3} placeholder={'orders.created\norders.updated'} />
          </Form.Item>
          <Form.Item name="aliasText" label={'\u522b\u540d'}>
            <Input.TextArea rows={2} placeholder={'\u8ba2\u5355\u521b\u5efa\n\u8ba2\u5355\u66f4\u65b0'} />
          </Form.Item>
          <div className="subscribe-panel-options">
            <Form.Item name="color" label={'\u989c\u8272'} className="compact-form-item">
              <Select allowClear options={topicColorOptions} style={{ width: 132 }} />
            </Form.Item>
            <Form.Item name="queueGroup" label="Queue Group" className="compact-form-item">
              <Input placeholder={'\u9009\u586b'} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={Boolean(editingSubscription)}
        title={'\u7f16\u8f91\u8ba2\u9605'}
        okText={'\u4fdd\u5b58'}
        cancelText={'\u53d6\u6d88'}
        confirmLoading={editSaving}
        onCancel={() => {
          setEditingSubscription(undefined)
          editForm.resetFields()
        }}
        onOk={() => void handleEdit()}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="subject"
            label={'\u8ba2\u9605 Subject'}
            rules={[{ required: true, message: '\u8bf7\u8f93\u5165 Subject' }]}
          >
            <Input placeholder="orders.created" />
          </Form.Item>
          <Form.Item name="alias" label={'\u522b\u540d'}>
            <Input placeholder={'\u4f8b\u5982\uff1a\u8ba2\u5355\u521b\u5efa'} />
          </Form.Item>
          <Form.Item name="color" label={'\u8ba2\u9605\u989c\u8272'}>
            <Select options={topicColorOptions} />
          </Form.Item>
          <Form.Item name="queueGroup" label="Queue Group">
            <Input placeholder={'\u9009\u586b'} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
