import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import type {
  ConsumerDeleteRequest,
  ConsumerFetchRequest,
  ConsumerFetchResponse,
  ConsumerInfo,
  ConsumerUpsertRequest,
  StreamDeleteRequest,
  StreamInfo,
  StreamUpsertRequest,
} from '../types'

interface JetStreamOverviewProps {
  loading: boolean
  streams: StreamInfo[]
  consumers: ConsumerInfo[]
  selectedStream?: string
  onSelectStream: (streamName: string) => void
  onSaveStream: (payload: StreamUpsertRequest) => Promise<void>
  onDeleteStream: (payload: StreamDeleteRequest) => Promise<void>
  onSaveConsumer: (payload: ConsumerUpsertRequest) => Promise<void>
  onDeleteConsumer: (payload: ConsumerDeleteRequest) => Promise<void>
  onFetchConsumer: (payload: ConsumerFetchRequest) => Promise<ConsumerFetchResponse>
  connectionId?: string
}

interface StreamFormValues {
  name: string
  subjectsText: string
  storage: string
  replicas: number
  maxAge?: number
  maxMsgs?: number
  maxBytes?: number
  maxMsgSize?: number
  retention?: string
  discard?: string
  duplicateWindow?: number
}

interface ConsumerFormValues {
  name: string
  ackPolicy: string
  deliverPolicy: string
  filterSubject?: string
  deliverSubject?: string
  maxDeliver?: number
  ackWait?: number
  maxAckPending?: number
}

const ackPolicyOptions = [
  { value: 'AckExplicitPolicy', label: 'AckExplicitPolicy' },
  { value: 'AckAllPolicy', label: 'AckAllPolicy' },
  { value: 'AckNonePolicy', label: 'AckNonePolicy' },
]

const deliverPolicyOptions = [
  { value: 'DeliverAllPolicy', label: 'DeliverAllPolicy' },
  { value: 'DeliverLastPolicy', label: 'DeliverLastPolicy' },
  { value: 'DeliverNewPolicy', label: 'DeliverNewPolicy' },
  { value: 'DeliverLastPerSubjectPolicy', label: 'DeliverLastPerSubjectPolicy' },
]

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function JetStreamOverview({
  loading,
  streams,
  consumers,
  selectedStream,
  onSelectStream,
  onSaveStream,
  onDeleteStream,
  onSaveConsumer,
  onDeleteConsumer,
  onFetchConsumer,
  connectionId,
}: JetStreamOverviewProps) {
  const { t } = useI18n()
  const [streamForm] = Form.useForm<StreamFormValues>()
  const [consumerForm] = Form.useForm<ConsumerFormValues>()
  const [streamModalOpen, setStreamModalOpen] = useState(false)
  const [consumerModalOpen, setConsumerModalOpen] = useState(false)
  const [editingStream, setEditingStream] = useState<StreamInfo>()
  const [editingConsumer, setEditingConsumer] = useState<ConsumerInfo>()
  const [selectedConsumerName, setSelectedConsumerName] = useState<string>()
  const [fetchBatchSize, setFetchBatchSize] = useState(10)
  const [fetchMaxWaitMs, setFetchMaxWaitMs] = useState(1500)
  const [fetching, setFetching] = useState(false)
  const [latestFetchSummary, setLatestFetchSummary] = useState<{
    consumerName: string
    count: number
    fetchedAt: string
  }>()

  const selectedStreamInfo = useMemo(
    () => streams.find((item) => item.name === selectedStream),
    [selectedStream, streams],
  )

  const selectedConsumer = useMemo(
    () => consumers.find((item) => item.name === selectedConsumerName),
    [consumers, selectedConsumerName],
  )

  useEffect(() => {
    if (!consumers.some((item) => item.name === selectedConsumerName)) {
      setSelectedConsumerName(consumers[0]?.name)
    }
  }, [consumers, selectedConsumerName])

  const openCreateStream = () => {
    setEditingStream(undefined)
    streamForm.setFieldsValue({
      name: '',
      subjectsText: selectedStream ? `${selectedStream.toLowerCase()}.>` : '',
      storage: 'FileStorage',
      replicas: 1,
    })
    setStreamModalOpen(true)
  }

  const openEditStream = (stream: StreamInfo) => {
    setEditingStream(stream)
    streamForm.setFieldsValue({
      name: stream.name,
      subjectsText: stream.subjects.join('\n'),
      storage: stream.storage,
      replicas: stream.replicas,
    })
    setStreamModalOpen(true)
  }

  const openCreateConsumer = () => {
    setEditingConsumer(undefined)
    consumerForm.setFieldsValue({
      name: '',
      ackPolicy: 'AckExplicitPolicy',
      deliverPolicy: 'DeliverAllPolicy',
      filterSubject: '',
      deliverSubject: '',
      maxDeliver: undefined,
      ackWait: undefined,
      maxAckPending: undefined,
    })
    setConsumerModalOpen(true)
  }

  const openEditConsumer = (consumer: ConsumerInfo) => {
    setEditingConsumer(consumer)
    consumerForm.setFieldsValue({
      name: consumer.name,
      ackPolicy: consumer.ackPolicy,
      deliverPolicy: consumer.deliverPolicy,
      filterSubject: consumer.filterSubject,
      deliverSubject: consumer.deliverSubject,
      maxDeliver: consumer.maxDeliver,
      ackWait: consumer.ackWait,
      maxAckPending: consumer.maxAckPending,
    })
    setConsumerModalOpen(true)
  }

  const handleFetch = async () => {
    if (!connectionId || !selectedStream || !selectedConsumer) {
      return
    }

    setFetching(true)
    try {
      const response = await onFetchConsumer({
        connectionId,
        streamName: selectedStream,
        consumerName: selectedConsumer.name,
        batchSize: fetchBatchSize,
        maxWaitMs: fetchMaxWaitMs,
      })
      setLatestFetchSummary({
        consumerName: selectedConsumer.name,
        count: response.messages.length,
        fetchedAt: new Date().toISOString(),
      })
    } finally {
      setFetching(false)
    }
  }

  return (
    <>
      <Card className="panel-card jetstream-panel-card" bodyStyle={{ padding: 0 }} title={null}>
        <div className="jetstream-header">
          <div>
            <Typography.Text className="panel-section-eyebrow">JetStream</Typography.Text>
            <Typography.Title level={5} className="jetstream-title">
              Streams & Consumers
            </Typography.Title>
          </div>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={openCreateStream} disabled={!connectionId}>
              {t('jetstream.createStream')}
            </Button>
            <Button icon={<PlusOutlined />} onClick={openCreateConsumer} disabled={!connectionId || !selectedStream}>
              {t('jetstream.createConsumer')}
            </Button>
          </Space>
        </div>

        <div className="jetstream-layout">
          <div className="jetstream-pane">
            <div className="jetstream-pane-head">
              <div>
                <Typography.Text className="panel-section-eyebrow">Streams</Typography.Text>
                <Typography.Title level={5} className="jetstream-pane-title">
                  Stream Catalog
                </Typography.Title>
              </div>
            </div>
            {streams.length === 0 ? (
              <div className="jetstream-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jetstream.noStreams')} />
              </div>
            ) : (
              <div className="jetstream-stream-list">
                {streams.map((stream) => (
                  <div
                    key={stream.name}
                    className={`jetstream-stream-card ${stream.name === selectedStream ? 'jetstream-stream-card-active' : ''}`}
                    onClick={() => onSelectStream(stream.name)}
                  >
                    <div className="jetstream-card-head">
                      <Space wrap>
                        <Typography.Text strong>{stream.name}</Typography.Text>
                        <Tag color="blue">{stream.storage}</Tag>
                        <Tag>{stream.replicas} replicas</Tag>
                      </Space>
                      <Space size={4}>
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditStream(stream)
                          }}
                        />
                        <Popconfirm
                          title={t('jetstream.deleteStreamConfirm', { name: stream.name })}
                          okText={t('jetstream.delete')}
                          cancelText={t('jetstream.cancel')}
                          onConfirm={(event) => {
                            event?.stopPropagation()
                            if (!connectionId) {
                              return Promise.resolve()
                            }
                            return onDeleteStream({ connectionId, name: stream.name })
                          }}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                    <div className="jetstream-card-meta">
                      <span>{stream.messages} msgs</span>
                      <span>{formatBytes(stream.bytes)}</span>
                      <span>{stream.consumers} consumers</span>
                    </div>
                    <Space wrap>
                      {stream.subjects.map((subject) => (
                        <Tag key={subject}>{subject}</Tag>
                      ))}
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="jetstream-pane">
            <div className="jetstream-pane-head">
              <div>
                <Typography.Text className="panel-section-eyebrow">Consumers</Typography.Text>
                <Typography.Title level={5} className="jetstream-pane-title">
                  {selectedStream ? `${selectedStream}` : 'Select Stream'}
                </Typography.Title>
              </div>
            </div>
            {!selectedStream ? (
              <div className="jetstream-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jetstream.selectStreamToViewConsumers')} />
              </div>
            ) : (
              <List
                loading={loading}
                className="jetstream-consumer-list"
                dataSource={consumers}
                locale={{ emptyText: t('jetstream.noConsumersInStream') }}
                renderItem={(item) => (
                  <List.Item
                    className={`jetstream-consumer-item ${item.name === selectedConsumerName ? 'jetstream-consumer-item-active' : ''}`}
                    onClick={() => setSelectedConsumerName(item.name)}
                    actions={[
                      <Button
                        key="edit"
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditConsumer(item)
                        }}
                      />,
                      <Popconfirm
                        key="delete"
                        title={t('jetstream.deleteConsumerConfirm', { name: item.name })}
                        okText={t('jetstream.delete')}
                        cancelText={t('jetstream.cancel')}
                        onConfirm={(event) => {
                          event?.stopPropagation()
                          if (!connectionId || !selectedStream) {
                            return Promise.resolve()
                          }
                          return onDeleteConsumer({
                            connectionId,
                            streamName: selectedStream,
                            consumerName: item.name,
                          })
                        }}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <Space direction="vertical" size={6}>
                      <Space wrap>
                        <Typography.Text strong>{item.name}</Typography.Text>
                        <Tag color={item.isPullMode ? 'cyan' : 'gold'}>{item.isPullMode ? 'Pull' : 'Push'}</Tag>
                        <Tag color="blue">{item.ackPolicy}</Tag>
                        <Tag color="geekblue">{item.deliverPolicy}</Tag>
                        {item.filterSubject ? <Tag color="purple">{item.filterSubject}</Tag> : null}
                      </Space>
                      <Typography.Text type="secondary">
                        {t('jetstream.pendingStatus', {
                          pending: item.numPending,
                          waiting: item.numWaiting,
                          ackPending: item.numAckPending,
                        })}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </div>

          <div className="jetstream-pane jetstream-inspector-pane">
            <div className="jetstream-pane-head">
              <div>
                <Typography.Text className="panel-section-eyebrow">Inspector</Typography.Text>
                <Typography.Title level={5} className="jetstream-pane-title">
                  Stream / Consumer Detail
                </Typography.Title>
              </div>
            </div>

            <div className="jetstream-inspector-card">
              <Typography.Text className="panel-section-eyebrow">Current Stream</Typography.Text>
              {!selectedStreamInfo ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jetstream.currentStreamEmpty')} />
              ) : (
                <div className="jetstream-meta-grid">
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Name</Typography.Text>
                    <Typography.Text>{selectedStreamInfo.name}</Typography.Text>
                  </div>
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Storage</Typography.Text>
                    <Typography.Text>{selectedStreamInfo.storage}</Typography.Text>
                  </div>
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Messages</Typography.Text>
                    <Typography.Text>{selectedStreamInfo.messages}</Typography.Text>
                  </div>
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Bytes</Typography.Text>
                    <Typography.Text>{formatBytes(selectedStreamInfo.bytes)}</Typography.Text>
                  </div>
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Consumers</Typography.Text>
                    <Typography.Text>{selectedStreamInfo.consumers}</Typography.Text>
                  </div>
                  <div className="jetstream-meta-item">
                    <Typography.Text type="secondary">Replicas</Typography.Text>
                    <Typography.Text>{selectedStreamInfo.replicas}</Typography.Text>
                  </div>
                </div>
              )}
            </div>

            <div className="jetstream-inspector-card">
              <Typography.Text className="panel-section-eyebrow">Consumer</Typography.Text>
              {!selectedConsumer ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jetstream.selectConsumerDetails')} />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>{selectedConsumer.name}</Typography.Text>
                    <Tag color={selectedConsumer.isPullMode ? 'cyan' : 'gold'}>
                      {selectedConsumer.isPullMode ? 'Pull Consumer' : 'Push Consumer'}
                    </Tag>
                    {selectedConsumer.deliverSubject ? <Tag>{selectedConsumer.deliverSubject}</Tag> : null}
                  </Space>
                  <div className="jetstream-meta-grid">
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Ack Policy</Typography.Text>
                      <Typography.Text>{selectedConsumer.ackPolicy}</Typography.Text>
                    </div>
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Deliver Policy</Typography.Text>
                      <Typography.Text>{selectedConsumer.deliverPolicy}</Typography.Text>
                    </div>
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Pending</Typography.Text>
                      <Typography.Text>{selectedConsumer.numPending}</Typography.Text>
                    </div>
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Waiting</Typography.Text>
                      <Typography.Text>{selectedConsumer.numWaiting}</Typography.Text>
                    </div>
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Ack Pending</Typography.Text>
                      <Typography.Text>{selectedConsumer.numAckPending}</Typography.Text>
                    </div>
                    <div className="jetstream-meta-item">
                      <Typography.Text type="secondary">Filter Subject</Typography.Text>
                      <Typography.Text>{selectedConsumer.filterSubject ?? '-'}</Typography.Text>
                    </div>
                  </div>
                </Space>
              )}
            </div>

            <div className="jetstream-inspector-card">
              <Typography.Text className="panel-section-eyebrow">Fetch</Typography.Text>
              {!selectedConsumer ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jetstream.selectConsumerDebug')} />
              ) : selectedConsumer.isPullMode ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Typography.Text type="secondary">
                    {t('jetstream.fetchHelp')}
                  </Typography.Text>
                  <Space wrap>
                    <InputNumber
                      min={1}
                      max={256}
                      addonBefore="Batch"
                      value={fetchBatchSize}
                      onChange={(value) => setFetchBatchSize(Number(value) || 10)}
                    />
                    <InputNumber
                      min={100}
                      max={30000}
                      step={100}
                      addonBefore="MaxWait(ms)"
                      value={fetchMaxWaitMs}
                      onChange={(value) => setFetchMaxWaitMs(Number(value) || 1500)}
                    />
                    <Button
                      type="primary"
                      loading={fetching}
                      onClick={() => void handleFetch()}
                      disabled={!connectionId || loading}
                    >
                      {t('jetstream.fetchNow')}
                    </Button>
                  </Space>
                  {latestFetchSummary && latestFetchSummary.consumerName === selectedConsumer.name ? (
                    <Alert
                      type="success"
                      showIcon
                      message={t('jetstream.latestFetchSummary', { count: latestFetchSummary.count })}
                      description={new Date(latestFetchSummary.fetchedAt).toLocaleString()}
                    />
                  ) : null}
                </Space>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message={t('jetstream.pushMode')}
                  description={t('jetstream.pushModeDescription')}
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={streamModalOpen}
        title={editingStream ? t('jetstream.editStream') : t('jetstream.newStream')}
        okText={t('jetstream.save')}
        cancelText={t('jetstream.cancel')}
        onCancel={() => setStreamModalOpen(false)}
        onOk={async () => {
          const values = await streamForm.validateFields()
          if (!connectionId) {
            return
          }
          await onSaveStream({
            connectionId,
            name: values.name,
            subjects: values.subjectsText
              .split(/\r?\n|,/)
              .map((item) => item.trim())
              .filter(Boolean),
            storage: values.storage,
            replicas: values.replicas,
            maxAge: values.maxAge,
            maxMsgs: values.maxMsgs,
            maxBytes: values.maxBytes,
            maxMsgSize: values.maxMsgSize,
            retention: values.retention,
            discard: values.discard,
            duplicateWindow: values.duplicateWindow,
          })
          setStreamModalOpen(false)
        }}
      >
        <Form form={streamForm} layout="vertical">
          <Form.Item name="name" label={t('jetstream.streamName')} rules={[{ required: true, message: t('jetstream.streamNameRequired') }]}>
            <Input disabled={Boolean(editingStream)} />
          </Form.Item>
          <Form.Item
            name="subjectsText"
            label="Subjects"
            rules={[{ required: true, message: t('jetstream.subjectsRequired') }]}
          >
            <Input.TextArea rows={4} placeholder={'orders.created\norders.updated'} />
          </Form.Item>
          <Form.Item name="storage" label="Storage">
            <Select
              options={[
                { value: 'FileStorage', label: 'FileStorage' },
                { value: 'MemoryStorage', label: 'MemoryStorage' },
              ]}
            />
          </Form.Item>
          <Form.Item name="replicas" label="Replicas">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('jetstream.advanced')}</Typography.Text>
          <Form.Item name="retention" label="Retention Policy">
            <Select
              allowClear
              placeholder={t('jetstream.retentionPlaceholder')}
              options={[
                { value: 'LimitsPolicy', label: t('jetstream.retentionLimits') },
                { value: 'InterestPolicy', label: t('jetstream.retentionInterest') },
                { value: 'WorkQueuePolicy', label: t('jetstream.retentionWorkQueue') },
              ]}
            />
          </Form.Item>
          <Form.Item name="discard" label="Discard Policy">
            <Select
              allowClear
              placeholder={t('jetstream.discardPlaceholder')}
              options={[
                { value: 'DiscardOld', label: t('jetstream.discardOld') },
                { value: 'DiscardNew', label: t('jetstream.discardNew') },
              ]}
            />
          </Form.Item>
          <Form.Item name="maxAge" label={t('jetstream.maxAge')}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder={t('jetstream.maxAgePlaceholder')} />
          </Form.Item>
          <Form.Item name="maxMsgs" label={t('jetstream.maxMessages')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxBytes" label={t('jetstream.maxBytes')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxMsgSize" label={t('jetstream.maxMsgSize')}>
            <InputNumber min={-1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="duplicateWindow" label={t('jetstream.duplicateWindow')}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder={t('jetstream.duplicateWindowPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={consumerModalOpen}
        title={editingConsumer ? t('jetstream.editConsumer') : t('jetstream.newConsumer')}
        okText={t('jetstream.save')}
        cancelText={t('jetstream.cancel')}
        onCancel={() => setConsumerModalOpen(false)}
        onOk={async () => {
          const values = await consumerForm.validateFields()
          if (!connectionId || !selectedStream) {
            return
          }
          await onSaveConsumer({
            connectionId,
            streamName: selectedStream,
            name: values.name,
            ackPolicy: values.ackPolicy,
            deliverPolicy: values.deliverPolicy,
            filterSubject: values.filterSubject?.trim(),
            deliverSubject: values.deliverSubject?.trim(),
            maxDeliver: values.maxDeliver,
            ackWait: values.ackWait,
            maxAckPending: values.maxAckPending,
          })
          setConsumerModalOpen(false)
        }}
      >
        <Form form={consumerForm} layout="vertical">
          <Form.Item name="name" label={t('jetstream.consumerName')} rules={[{ required: true, message: t('jetstream.consumerNameRequired') }]}>
            <Input disabled={Boolean(editingConsumer)} />
          </Form.Item>
          <Form.Item name="ackPolicy" label="Ack Policy">
            <Select options={ackPolicyOptions} />
          </Form.Item>
          <Form.Item name="deliverPolicy" label="Deliver Policy">
            <Select options={deliverPolicyOptions} />
          </Form.Item>
          <Form.Item name="filterSubject" label="Filter Subject">
            <Input placeholder={t('jetstream.filterSubjectPlaceholder')} />
          </Form.Item>
          <Form.Item name="deliverSubject" label="Deliver Subject（Push Consumer）">
            <Input placeholder={t('jetstream.deliverSubjectPlaceholder')} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('jetstream.advanced')}</Typography.Text>
          <Form.Item name="maxDeliver" label={t('jetstream.maxDeliver')}>
            <InputNumber min={-1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="ackWait" label={t('jetstream.ackWait')}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder={t('jetstream.ackWaitPlaceholder')} />
          </Form.Item>
          <Form.Item name="maxAckPending" label="Max Ack Pending">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
