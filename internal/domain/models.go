package domain

import "time"

type Snapshot struct {
	GeneratedAt   time.Time           `json:"generatedAt"`
	Connections   []ConnectionProfile `json:"connections"`
	Subscriptions []SubscriptionInfo  `json:"subscriptions"`
	Messages      []MessageRecord     `json:"messages"`
}

type LogRetentionSettings struct {
	MaxTotalBytes int64 `json:"maxTotalBytes"`
	MaxEntries    int   `json:"maxEntries"`
}

type AppSettings struct {
	AutoCheckUpdate       bool                 `json:"autoCheckUpdate"`
	AutoResubscribe       bool                 `json:"autoResubscribe"`
	MultiSubjectSubscribe bool                 `json:"multiSubjectSubscribe"`
	MaxReconnectTimes     int                  `json:"maxReconnectTimes"`
	MaxPayloadSize        int                  `json:"maxPayloadSize"`
	ThemeMode             string               `json:"themeMode"`
	Language              string               `json:"language"`
	LogRetention          LogRetentionSettings `json:"logRetention"`
}

type UpdateState struct {
	DownloadedPackage *UpdateDownloadResult `json:"downloadedPackage,omitempty"`
}

type ManagedResourceFile struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	RelativePath string    `json:"relativePath"`
	Size         int64     `json:"size"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Reused       bool      `json:"reused,omitempty"`
}

type UpdateInfo struct {
	CurrentVersion   string    `json:"currentVersion"`
	LatestVersion    string    `json:"latestVersion"`
	ReleaseFound     bool      `json:"releaseFound"`
	HasUpdate        bool      `json:"hasUpdate"`
	HasPlatformAsset bool      `json:"hasPlatformAsset"`
	Platform         string    `json:"platform"`
	ReleaseURL       string    `json:"releaseUrl,omitempty"`
	DownloadURL      string    `json:"downloadUrl,omitempty"`
	AssetName        string    `json:"assetName,omitempty"`
	PublishedAt      time.Time `json:"publishedAt,omitempty"`
	ReleaseNotes     string    `json:"releaseNotes,omitempty"`
}

type UpdateDownloadResult struct {
	Path          string    `json:"path"`
	AssetName     string    `json:"assetName"`
	LatestVersion string    `json:"latestVersion"`
	ReleaseURL    string    `json:"releaseUrl,omitempty"`
	DownloadURL   string    `json:"downloadUrl,omitempty"`
	Bytes         int64     `json:"bytes"`
	DownloadedAt  time.Time `json:"downloadedAt"`
}

type UpdateDownloadProgress struct {
	Status          string  `json:"status"`
	LatestVersion   string  `json:"latestVersion,omitempty"`
	AssetName       string  `json:"assetName,omitempty"`
	Path            string  `json:"path,omitempty"`
	DownloadedBytes int64   `json:"downloadedBytes"`
	TotalBytes      int64   `json:"totalBytes"`
	ProgressPercent float64 `json:"progressPercent"`
	ErrorMessage    string  `json:"errorMessage,omitempty"`
}

type SubscriptionInfo struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connectionId"`
	Subject      string    `json:"subject"`
	QueueGroup   string    `json:"queueGroup,omitempty"`
	Active       bool      `json:"active"`
	MessageCount int       `json:"messageCount"`
	CreatedAt    time.Time `json:"createdAt"`
}

type MessageRecord struct {
	ID                    string              `json:"id"`
	ConnectionID          string              `json:"connectionId"`
	SubscriptionID        string              `json:"subscriptionId,omitempty"`
	SubscriptionPattern   string              `json:"subscriptionPattern,omitempty"`
	Direction             string              `json:"direction"`
	Kind                  string              `json:"kind"`
	Subject               string              `json:"subject"`
	Reply                 string              `json:"reply,omitempty"`
	Payload               string              `json:"payload"`
	PayloadBase64         string              `json:"payloadBase64,omitempty"`
	PayloadEncoding       string              `json:"payloadEncoding,omitempty"`
	Headers               map[string][]string `json:"headers,omitempty"`
	Size                  int                 `json:"size"`
	JetStream             bool                `json:"jetStream"`
	JetStreamStream       string              `json:"jetStreamStream,omitempty"`
	JetStreamConsumer     string              `json:"jetStreamConsumer,omitempty"`
	JetStreamSequence     uint64              `json:"jetStreamSequence,omitempty"`
	CorrelationID         string              `json:"correlationId,omitempty"`
	RelatedMessageID      string              `json:"relatedMessageId,omitempty"`
	ReplaySourceMessageID string              `json:"replaySourceMessageId,omitempty"`
	RequestDurationMS     int64               `json:"requestDurationMs,omitempty"`
	RequestTimeoutMS      int                 `json:"requestTimeoutMs,omitempty"`
	RequestStatus         string              `json:"requestStatus,omitempty"`
	ErrorMessage          string              `json:"errorMessage,omitempty"`
	AckEligible           bool                `json:"ackEligible"`
	AckState              string              `json:"ackState,omitempty"`
	ReceivedAt            time.Time           `json:"receivedAt"`
}

type StreamInfo struct {
	Name      string   `json:"name"`
	Subjects  []string `json:"subjects"`
	Messages  uint64   `json:"messages"`
	Bytes     uint64   `json:"bytes"`
	Consumers int      `json:"consumers"`
	Storage   string   `json:"storage"`
	Replicas  int      `json:"replicas"`
}

type ConsumerInfo struct {
	Name           string `json:"name"`
	StreamName     string `json:"streamName"`
	AckPolicy      string `json:"ackPolicy"`
	DeliverPolicy  string `json:"deliverPolicy"`
	FilterSubject  string `json:"filterSubject,omitempty"`
	DeliverSubject string `json:"deliverSubject,omitempty"`
	IsPullMode     bool   `json:"isPullMode"`
	NumPending     uint64 `json:"numPending"`
	NumWaiting     int    `json:"numWaiting"`
	NumAckPending  int    `json:"numAckPending"`
	MaxDeliver     int    `json:"maxDeliver,omitempty"`
	AckWait        int64  `json:"ackWait,omitempty"`
	MaxAckPending  int    `json:"maxAckPending,omitempty"`
}

type PublishRequest struct {
	ConnectionID    string            `json:"connectionId"`
	Subject         string            `json:"subject"`
	Payload         string            `json:"payload"`
	PayloadBase64   string            `json:"payloadBase64,omitempty"`
	PayloadEncoding string            `json:"payloadEncoding,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	UseJetStream    bool              `json:"useJetStream"`
	UseMsgID        bool              `json:"useMsgId,omitempty"`
}

type RepublishMessageRequest struct {
	MessageID       string            `json:"messageId"`
	Subject         string            `json:"subject"`
	Payload         string            `json:"payload"`
	PayloadBase64   string            `json:"payloadBase64,omitempty"`
	PayloadEncoding string            `json:"payloadEncoding,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	UseJetStream    bool              `json:"useJetStream"`
}

type RepublishMessageResponse struct {
	Message MessageRecord `json:"message"`
}

type RequestMessageRequest struct {
	ConnectionID          string            `json:"connectionId"`
	Subject               string            `json:"subject"`
	Payload               string            `json:"payload"`
	PayloadBase64         string            `json:"payloadBase64,omitempty"`
	PayloadEncoding       string            `json:"payloadEncoding,omitempty"`
	Headers               map[string]string `json:"headers,omitempty"`
	RequestID             string            `json:"requestId,omitempty"`
	ReplaySourceMessageID string            `json:"replaySourceMessageId,omitempty"`
	TimeoutMS             int64             `json:"timeoutMs"`
}

type RequestMessageResponse struct {
	Message MessageRecord `json:"message"`
}

type ReplyRequest struct {
	ConnectionID    string            `json:"connectionId"`
	ReplySubject    string            `json:"replySubject"`
	Payload         string            `json:"payload"`
	PayloadBase64   string            `json:"payloadBase64,omitempty"`
	PayloadEncoding string            `json:"payloadEncoding,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	RequestID       string            `json:"requestId,omitempty"`
	SourceMessageID string            `json:"sourceMessageId,omitempty"`
}

type MessageActionRequest struct {
	MessageID string `json:"messageId"`
}

type SubscribeRequest struct {
	ConnectionID string `json:"connectionId"`
	Subject      string `json:"subject"`
	QueueGroup   string `json:"queueGroup,omitempty"`
}

type UpdateSubscriptionRequest struct {
	SubscriptionID string `json:"subscriptionId"`
	Subject        string `json:"subject"`
	QueueGroup     string `json:"queueGroup,omitempty"`
}

type SetSubscriptionStateRequest struct {
	SubscriptionID string `json:"subscriptionId"`
	Active         bool   `json:"active"`
}

type StreamUpsertRequest struct {
	ConnectionID    string   `json:"connectionId"`
	Name            string   `json:"name"`
	Subjects        []string `json:"subjects"`
	Storage         string   `json:"storage"`
	Replicas        int      `json:"replicas"`
	MaxAge          int64    `json:"maxAge,omitempty"`
	MaxMsgs         int64    `json:"maxMsgs,omitempty"`
	MaxBytes        int64    `json:"maxBytes,omitempty"`
	MaxMsgSize      int32    `json:"maxMsgSize,omitempty"`
	Retention       string   `json:"retention,omitempty"`
	Discard         string   `json:"discard,omitempty"`
	DuplicateWindow int64    `json:"duplicateWindow,omitempty"`
}

type StreamDeleteRequest struct {
	ConnectionID string `json:"connectionId"`
	Name         string `json:"name"`
}

type ConsumerUpsertRequest struct {
	ConnectionID   string `json:"connectionId"`
	StreamName     string `json:"streamName"`
	Name           string `json:"name"`
	AckPolicy      string `json:"ackPolicy"`
	DeliverPolicy  string `json:"deliverPolicy"`
	FilterSubject  string `json:"filterSubject,omitempty"`
	DeliverSubject string `json:"deliverSubject,omitempty"`
	MaxDeliver     int    `json:"maxDeliver,omitempty"`
	AckWait        int64  `json:"ackWait,omitempty"`
	MaxAckPending  int    `json:"maxAckPending,omitempty"`
}

type ConsumerDeleteRequest struct {
	ConnectionID string `json:"connectionId"`
	StreamName   string `json:"streamName"`
	ConsumerName string `json:"consumerName"`
}

type ConsumerFetchRequest struct {
	ConnectionID string `json:"connectionId"`
	StreamName   string `json:"streamName"`
	ConsumerName string `json:"consumerName"`
	BatchSize    int    `json:"batchSize"`
	MaxWaitMS    int64  `json:"maxWaitMs"`
}

type ConsumerFetchResponse struct {
	Messages []MessageRecord `json:"messages"`
}

type ExportConnectionsRequest struct {
	MaskSensitive bool `json:"maskSensitive"`
}

type ExportConnectionsResponse struct {
	Content string `json:"content"`
	Count   int    `json:"count"`
	Masked  bool   `json:"masked"`
}

type ExportConnectionsFileResponse struct {
	Path   string `json:"path"`
	Count  int    `json:"count"`
	Masked bool   `json:"masked"`
}

type ImportConnectionsRequest struct {
	Content   string `json:"content"`
	Overwrite bool   `json:"overwrite"`
}

type ImportConnectionsFromFileRequest struct {
	Overwrite bool `json:"overwrite"`
}

type ImportConnectionsResponse struct {
	Imported    int                 `json:"imported"`
	Skipped     int                 `json:"skipped"`
	Connections []ConnectionProfile `json:"connections"`
	SourcePath  string              `json:"sourcePath,omitempty"`
}

type ConnectionProfile struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	URL             string     `json:"url"`
	AuthMode        string     `json:"authMode,omitempty"`
	Username        string     `json:"username,omitempty"`
	Password        string     `json:"password,omitempty"`
	Token           string     `json:"token,omitempty"`
	CertFile        string     `json:"certFile,omitempty"`
	KeyFile         string     `json:"keyFile,omitempty"`
	CAFile          string     `json:"caFile,omitempty"`
	NKeyOrSeed      string     `json:"nkeyOrSeed,omitempty"`
	CredsFile       string     `json:"credsFile,omitempty"`
	Group           string     `json:"group,omitempty"`
	Description     string     `json:"description,omitempty"`
	Connected       bool       `json:"connected"`
	LastError       string     `json:"lastError,omitempty"`
	LastConnectedAt *time.Time `json:"lastConnectedAt,omitempty"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type ConnectionInput struct {
	ID          string `json:"id,omitempty"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	AuthMode    string `json:"authMode,omitempty"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	Token       string `json:"token,omitempty"`
	CertFile    string `json:"certFile,omitempty"`
	KeyFile     string `json:"keyFile,omitempty"`
	CAFile      string `json:"caFile,omitempty"`
	NKeyOrSeed  string `json:"nkeyOrSeed,omitempty"`
	CredsFile   string `json:"credsFile,omitempty"`
	Group       string `json:"group,omitempty"`
	Description string `json:"description,omitempty"`
}
