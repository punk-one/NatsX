package natsclient

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"natsx/internal/domain"
	"natsx/internal/storage"

	"github.com/nats-io/nats.go"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultLogMaxEntries = 1000
	defaultLogMaxBytes   = int64(100 * 1024 * 1024)
	defaultThemeMode     = "light"
	defaultLanguage      = "zh-CN"
	defaultReconnects    = 10
	defaultPayloadSizeKB = 512
	defaultRequestWait   = 5 * time.Second
	minimumRequestWait   = 250 * time.Millisecond
	defaultFetchWait     = 1500 * time.Millisecond
	minimumFetchWait     = 100 * time.Millisecond
	defaultFetchBatch    = 10
	maximumFetchBatch    = 256
	kindPublish          = "publish"
	kindMessage          = "message"
	kindRequest          = "request"
	kindResponse         = "response"
	kindReply            = "reply"
	ackStatePending      = "pending"
	ackStateAcked        = "acked"
	ackStateNacked       = "nacked"
	ackStateTermed       = "termed"
	requestIDHeader      = "X-NatsX-Request-Id"
	authModeNone         = "none"
	authModeUser         = "user"
	authModeToken        = "token"
	authModeTLS          = "tls"
	authModeNKey         = "nkey"
	authModeCreds        = "creds"
)

type connectionStore interface {
	Load() ([]domain.ConnectionProfile, error)
	Save([]domain.ConnectionProfile) error
	Path() string
}

type settingsStore interface {
	LoadAppSettings() (domain.AppSettings, error)
	SaveAppSettings(domain.AppSettings) error
	Path() string
}

type messageStore interface {
	LoadMessages() ([]domain.MessageRecord, error)
	UpsertMessage(domain.MessageRecord) error
	DeleteMessagesByConnection(string) error
	ApplyLogRetention(domain.LogRetentionSettings) error
	Path() string
}

type clientRuntime struct {
	nc *nats.Conn
	js nats.JetStreamContext
}

type messageAction struct {
	ack  func() error
	nak  func() error
	term func() error
}

type Service struct {
	ctx                 context.Context
	mu                  sync.RWMutex
	sequence            uint64
	profiles            map[string]*domain.ConnectionProfile
	clients             map[string]*clientRuntime
	subscriptions       map[string]*domain.SubscriptionInfo
	subscriptionHandles map[string]*nats.Subscription
	messages            []domain.MessageRecord
	messageBytes        int64
	messageActions      map[string]*messageAction
	store               connectionStore
	settingsStore       settingsStore
	messageStore        messageStore
	appSettings         domain.AppSettings
	logRetention        domain.LogRetentionSettings
}

func NewService() *Service {
	now := time.Now()
	settings := defaultAppSettings()
	return &Service{
		profiles: map[string]*domain.ConnectionProfile{
			"local": {
				ID:          "local",
				Name:        "Local NATS",
				URL:         "nats://127.0.0.1:4222",
				AuthMode:    authModeNone,
				Description: "Default local NATS connection",
				UpdatedAt:   now,
			},
		},
		clients:             map[string]*clientRuntime{},
		subscriptions:       map[string]*domain.SubscriptionInfo{},
		subscriptionHandles: map[string]*nats.Subscription{},
		messages:            make([]domain.MessageRecord, 0, 32),
		messageActions:      map[string]*messageAction{},
		appSettings:         settings,
		logRetention:        settings.LogRetention,
	}
}

func defaultAppSettings() domain.AppSettings {
	return domain.AppSettings{
		AutoCheckUpdate:       true,
		AutoResubscribe:       true,
		MultiSubjectSubscribe: true,
		MaxReconnectTimes:     defaultReconnects,
		MaxPayloadSize:        defaultPayloadSizeKB,
		ThemeMode:             defaultThemeMode,
		Language:              defaultLanguage,
		LogRetention:          defaultLogRetentionSettings(),
	}
}

func defaultLogRetentionSettings() domain.LogRetentionSettings {
	return domain.LogRetentionSettings{
		MaxTotalBytes: defaultLogMaxBytes,
		MaxEntries:    defaultLogMaxEntries,
	}
}

func normalizeAppSettings(input domain.AppSettings) domain.AppSettings {
	settings := input
	defaults := defaultAppSettings()
	if settings.MaxReconnectTimes <= 0 {
		settings.MaxReconnectTimes = defaults.MaxReconnectTimes
	}
	if settings.MaxPayloadSize <= 0 {
		settings.MaxPayloadSize = defaults.MaxPayloadSize
	}
	switch strings.ToLower(strings.TrimSpace(settings.ThemeMode)) {
	case "dark":
		settings.ThemeMode = "dark"
	case "system":
		settings.ThemeMode = "system"
	default:
		settings.ThemeMode = defaults.ThemeMode
	}
	switch strings.ToLower(strings.TrimSpace(settings.Language)) {
	case "en-us":
		settings.Language = "en-US"
	case "zh-cn", "zh", "":
		settings.Language = defaults.Language
	default:
		settings.Language = defaults.Language
	}
	settings.LogRetention = normalizeLogRetentionSettings(settings.LogRetention)
	return settings
}

func normalizeLogRetentionSettings(input domain.LogRetentionSettings) domain.LogRetentionSettings {
	settings := input
	if settings.MaxEntries <= 0 {
		settings.MaxEntries = defaultLogMaxEntries
	}
	if settings.MaxTotalBytes <= 0 {
		settings.MaxTotalBytes = defaultLogMaxBytes
	}
	return settings
}

func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) UseStore(store connectionStore) error {
	if store == nil {
		return nil
	}

	profiles, err := store.Load()
	if err != nil {
		if errors.Is(err, storage.ErrStoreNotFound) {
			s.mu.Lock()
			s.store = store
			persistErr := s.saveProfilesLocked()
			s.mu.Unlock()
			return persistErr
		}
		return err
	}

	now := time.Now()
	loadedProfiles := make(map[string]*domain.ConnectionProfile, len(profiles))
	for _, profile := range profiles {
		profileCopy := profile
		profileCopy.Connected = false
		if profileCopy.ID == "" {
			profileCopy.ID = s.nextID("conn")
		}
		if profileCopy.UpdatedAt.IsZero() {
			profileCopy.UpdatedAt = now
		}
		applyAuthMode(&profileCopy)
		loadedProfiles[profileCopy.ID] = &profileCopy
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.store = store
	s.profiles = loadedProfiles
	if len(s.profiles) == 0 {
		s.profiles = map[string]*domain.ConnectionProfile{}
	}
	return nil
}

func (s *Service) UseSettingsStore(store settingsStore) error {
	if store == nil {
		return nil
	}

	settings, err := store.LoadAppSettings()
	if err != nil && !errors.Is(err, storage.ErrSettingsStoreNotFound) {
		return err
	}

	if errors.Is(err, storage.ErrSettingsStoreNotFound) {
		settings = defaultAppSettings()
		if saveErr := store.SaveAppSettings(settings); saveErr != nil {
			return saveErr
		}
	}

	normalized := normalizeAppSettings(settings)

	s.mu.Lock()
	s.settingsStore = store
	s.appSettings = normalized
	s.logRetention = normalized.LogRetention
	s.trimMessagesLocked()
	s.mu.Unlock()

	return nil
}

func (s *Service) UseMessageStore(store messageStore) error {
	if store == nil {
		return nil
	}

	s.mu.RLock()
	retention := s.logRetention
	s.mu.RUnlock()

	if err := store.ApplyLogRetention(retention); err != nil {
		return err
	}

	messages, err := store.LoadMessages()
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.messageStore = store
	s.messages = messages
	s.messageBytes = recalculateMessageBytes(messages)
	s.trimMessagesLocked()
	s.mu.Unlock()

	return nil
}

func (s *Service) GetAppSettings() domain.AppSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	settings := s.appSettings
	settings.LogRetention = s.logRetention
	return settings
}

func (s *Service) SaveAppSettings(input domain.AppSettings) (domain.AppSettings, error) {
	settings := normalizeAppSettings(input)

	s.mu.Lock()
	s.appSettings = settings
	s.logRetention = settings.LogRetention
	s.trimMessagesLocked()
	settingsStore := s.settingsStore
	messageStore := s.messageStore
	s.mu.Unlock()

	if settingsStore != nil {
		if err := settingsStore.SaveAppSettings(settings); err != nil {
			return domain.AppSettings{}, err
		}
	}

	if messageStore != nil {
		if err := messageStore.ApplyLogRetention(settings.LogRetention); err != nil {
			return domain.AppSettings{}, err
		}
	}

	return settings, nil
}

func (s *Service) GetLogRetentionSettings() domain.LogRetentionSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.logRetention
}

func (s *Service) SaveLogRetentionSettings(input domain.LogRetentionSettings) (domain.LogRetentionSettings, error) {
	s.mu.RLock()
	settings := s.appSettings
	s.mu.RUnlock()

	settings.LogRetention = normalizeLogRetentionSettings(input)
	saved, err := s.SaveAppSettings(settings)
	if err != nil {
		return domain.LogRetentionSettings{}, err
	}
	return saved.LogRetention, nil
}

func (s *Service) GetSnapshot() domain.Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	connections := make([]domain.ConnectionProfile, 0, len(s.profiles))
	for _, profile := range s.profiles {
		copyProfile := *profile
		copyProfile.Connected = s.clients[profile.ID] != nil
		connections = append(connections, copyProfile)
	}

	subscriptions := make([]domain.SubscriptionInfo, 0, len(s.subscriptions))
	for _, subscription := range s.subscriptions {
		copySubscription := *subscription
		subscriptions = append(subscriptions, copySubscription)
	}

	messages := make([]domain.MessageRecord, len(s.messages))
	copy(messages, s.messages)

	sort.Slice(connections, func(i, j int) bool {
		if connections[i].Connected != connections[j].Connected {
			return connections[i].Connected
		}
		return connections[i].UpdatedAt.After(connections[j].UpdatedAt)
	})
	sort.Slice(subscriptions, func(i, j int) bool {
		if subscriptions[i].Active != subscriptions[j].Active {
			return subscriptions[i].Active
		}
		return subscriptions[i].CreatedAt.After(subscriptions[j].CreatedAt)
	})
	sort.Slice(messages, func(i, j int) bool {
		return messages[i].ReceivedAt.After(messages[j].ReceivedAt)
	})

	return domain.Snapshot{
		GeneratedAt:   time.Now(),
		Connections:   connections,
		Subscriptions: subscriptions,
		Messages:      messages,
	}
}

func (s *Service) SaveConnection(input domain.ConnectionInput) (domain.ConnectionProfile, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.ConnectionProfile{}, errors.New("connection name is required")
	}
	if strings.TrimSpace(input.URL) == "" {
		return domain.ConnectionProfile{}, errors.New("connection URL is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	connectionID := input.ID
	existing, hasExisting := s.profiles[input.ID]
	if connectionID == "" {
		connectionID = s.nextID("conn")
	}
	if hasExisting && s.clients[input.ID] != nil {
		return domain.ConnectionProfile{}, errors.New("disconnect the connection before editing it")
	}

	authMode := normalizeAuthMode(input.AuthMode)
	profile := &domain.ConnectionProfile{
		ID:          connectionID,
		Name:        strings.TrimSpace(input.Name),
		URL:         strings.TrimSpace(input.URL),
		AuthMode:    authMode,
		Username:    strings.TrimSpace(input.Username),
		Password:    input.Password,
		Token:       strings.TrimSpace(input.Token),
		CertFile:    strings.TrimSpace(input.CertFile),
		KeyFile:     strings.TrimSpace(input.KeyFile),
		CAFile:      strings.TrimSpace(input.CAFile),
		NKeyOrSeed:  strings.TrimSpace(input.NKeyOrSeed),
		CredsFile:   strings.TrimSpace(input.CredsFile),
		Group:       strings.TrimSpace(input.Group),
		Description: strings.TrimSpace(input.Description),
		UpdatedAt:   time.Now(),
	}
	applyAuthMode(profile)
	if hasExisting {
		profile.LastConnectedAt = existing.LastConnectedAt
		profile.LastError = existing.LastError
	}

	s.profiles[connectionID] = profile
	if err := s.saveProfilesLocked(); err != nil {
		return domain.ConnectionProfile{}, err
	}

	copyProfile := *profile
	copyProfile.Connected = s.clients[connectionID] != nil
	return copyProfile, nil
}

func (s *Service) ExportConnections(request domain.ExportConnectionsRequest) (domain.ExportConnectionsResponse, error) {
	s.mu.RLock()
	profiles := make([]domain.ConnectionProfile, 0, len(s.profiles))
	for _, profile := range s.profiles {
		copyProfile := *profile
		copyProfile.Connected = false
		profiles = append(profiles, copyProfile)
	}
	s.mu.RUnlock()

	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].UpdatedAt.After(profiles[j].UpdatedAt)
	})

	profiles = maskConnectionProfiles(profiles, request.MaskSensitive)

	content, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return domain.ExportConnectionsResponse{}, err
	}

	return domain.ExportConnectionsResponse{
		Content: string(content) + "\n",
		Count:   len(profiles),
		Masked:  request.MaskSensitive,
	}, nil
}

func (s *Service) ImportConnections(request domain.ImportConnectionsRequest) (domain.ImportConnectionsResponse, error) {
	inputs, err := parseImportConnectionsContent(request.Content)
	if err != nil {
		return domain.ImportConnectionsResponse{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	response := domain.ImportConnectionsResponse{}
	now := time.Now()
	for _, input := range inputs {
		if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.URL) == "" {
			response.Skipped++
			continue
		}

		connectionID := strings.TrimSpace(input.ID)
		if connectionID == "" {
			connectionID = s.nextID("conn")
		}

		existing, hasExisting := s.profiles[connectionID]
		if hasExisting && !request.Overwrite {
			response.Skipped++
			continue
		}
		if hasExisting && s.clients[connectionID] != nil {
			response.Skipped++
			continue
		}

		profile := &domain.ConnectionProfile{
			ID:          connectionID,
			Name:        strings.TrimSpace(input.Name),
			URL:         strings.TrimSpace(input.URL),
			AuthMode:    normalizeAuthMode(input.AuthMode),
			Username:    strings.TrimSpace(input.Username),
			Password:    input.Password,
			Token:       strings.TrimSpace(input.Token),
			CertFile:    strings.TrimSpace(input.CertFile),
			KeyFile:     strings.TrimSpace(input.KeyFile),
			CAFile:      strings.TrimSpace(input.CAFile),
			NKeyOrSeed:  strings.TrimSpace(input.NKeyOrSeed),
			CredsFile:   strings.TrimSpace(input.CredsFile),
			Group:       strings.TrimSpace(input.Group),
			Description: strings.TrimSpace(input.Description),
			UpdatedAt:   now,
		}
		applyAuthMode(profile)
		if hasExisting {
			profile.LastConnectedAt = existing.LastConnectedAt
			profile.LastError = existing.LastError
		}

		s.profiles[connectionID] = profile
		response.Imported++
	}

	if response.Imported > 0 {
		if err := s.saveProfilesLocked(); err != nil {
			return domain.ImportConnectionsResponse{}, err
		}
	}

	response.Connections = snapshotConnections(s.profiles, s.clients)
	return response, nil
}

func (s *Service) DeleteConnection(connectionID string) error {
	if strings.TrimSpace(connectionID) == "" {
		return errors.New("missing connection ID")
	}

	if err := s.Disconnect(connectionID); err != nil {
		return err
	}

	s.mu.Lock()
	delete(s.profiles, connectionID)
	for subscriptionID, subscription := range s.subscriptions {
		if subscription.ConnectionID == connectionID {
			delete(s.subscriptions, subscriptionID)
			delete(s.subscriptionHandles, subscriptionID)
		}
	}

	filteredMessages := s.messages[:0]
	for _, message := range s.messages {
		if message.ConnectionID != connectionID {
			filteredMessages = append(filteredMessages, message)
		} else {
			delete(s.messageActions, message.ID)
		}
	}
	s.messages = filteredMessages
	s.messageBytes = recalculateMessageBytes(filteredMessages)
	store := s.messageStore
	saveErr := s.saveProfilesLocked()
	s.mu.Unlock()

	if saveErr != nil {
		return saveErr
	}
	if store != nil {
		if err := store.DeleteMessagesByConnection(connectionID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Connect(connectionID string) (domain.ConnectionProfile, error) {
	s.mu.RLock()
	profile, ok := s.profiles[connectionID]
	if !ok {
		s.mu.RUnlock()
		return domain.ConnectionProfile{}, errors.New("connection not found")
	}
	if s.clients[connectionID] != nil {
		copyProfile := *profile
		copyProfile.Connected = true
		s.mu.RUnlock()
		return copyProfile, nil
	}
	profileCopy := *profile
	s.mu.RUnlock()

	options := []nats.Option{
		nats.Name(profileCopy.Name),
		nats.Timeout(5 * time.Second),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2 * time.Second),
		nats.DrainTimeout(3 * time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			}
			s.mu.Lock()
			if existing := s.profiles[connectionID]; existing != nil {
				if errMsg != "" {
					existing.LastError = errMsg
				}
				existing.UpdatedAt = time.Now()
			}
			s.mu.Unlock()
			if s.ctx != nil {
				wailsruntime.EventsEmit(s.ctx, "natsx:connection_state", map[string]interface{}{
					"connectionId": connectionID,
					"connected":    false,
					"lastError":    errMsg,
				})
			}
		}),
		nats.ReconnectHandler(func(_ *nats.Conn) {
			s.mu.Lock()
			if existing := s.profiles[connectionID]; existing != nil {
				existing.LastError = ""
				existing.UpdatedAt = time.Now()
			}
			s.mu.Unlock()
			if s.ctx != nil {
				wailsruntime.EventsEmit(s.ctx, "natsx:connection_state", map[string]interface{}{
					"connectionId": connectionID,
					"connected":    true,
					"lastError":    "",
				})
			}
		}),
	}

	authOptions, err := buildAuthOptions(profileCopy)
	if err != nil {
		s.mu.Lock()
		if existing := s.profiles[connectionID]; existing != nil {
			existing.LastError = err.Error()
			existing.UpdatedAt = time.Now()
			_ = s.saveProfilesLocked()
		}
		s.mu.Unlock()
		return domain.ConnectionProfile{}, err
	}
	options = append(options, authOptions...)

	nc, err := nats.Connect(profileCopy.URL, options...)
	if err != nil {
		s.mu.Lock()
		if existing := s.profiles[connectionID]; existing != nil {
			existing.LastError = err.Error()
			existing.UpdatedAt = time.Now()
			_ = s.saveProfilesLocked()
		}
		s.mu.Unlock()
		return domain.ConnectionProfile{}, err
	}

	js, _ := nc.JetStream()

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.clients[connectionID] = &clientRuntime{nc: nc, js: js}
	if existing := s.profiles[connectionID]; existing != nil {
		existing.LastConnectedAt = &now
		existing.LastError = ""
		existing.UpdatedAt = now
		_ = s.saveProfilesLocked()
		copyProfile := *existing
		copyProfile.Connected = true
		return copyProfile, nil
	}

	return domain.ConnectionProfile{}, errors.New("connection state is invalid")
}

func (s *Service) Disconnect(connectionID string) error {
	if strings.TrimSpace(connectionID) == "" {
		return errors.New("missing connection ID")
	}

	s.mu.Lock()
	client := s.clients[connectionID]
	if client == nil {
		s.mu.Unlock()
		return nil
	}

	for subscriptionID, subscription := range s.subscriptions {
		if subscription.ConnectionID != connectionID {
			continue
		}
		if handle := s.subscriptionHandles[subscriptionID]; handle != nil {
			_ = handle.Unsubscribe()
			delete(s.subscriptionHandles, subscriptionID)
		}
		subscription.Active = false
	}

	delete(s.clients, connectionID)
	s.mu.Unlock()

	client.nc.Close()
	return nil
}

func (s *Service) RepublishMessage(request domain.RepublishMessageRequest) (domain.RepublishMessageResponse, error) {
	if strings.TrimSpace(request.MessageID) == "" {
		return domain.RepublishMessageResponse{}, errors.New("message ID is required")
	}
	if strings.TrimSpace(request.Subject) == "" {
		return domain.RepublishMessageResponse{}, errors.New("subject is required")
	}

	s.mu.RLock()
	var sourceMessage *domain.MessageRecord
	for index := range s.messages {
		if s.messages[index].ID == request.MessageID {
			copied := s.messages[index]
			sourceMessage = &copied
			break
		}
	}
	s.mu.RUnlock()
	if sourceMessage == nil {
		return domain.RepublishMessageResponse{}, errors.New("source message not found")
	}

	client, err := s.requireClient(sourceMessage.ConnectionID)
	if err != nil {
		return domain.RepublishMessageResponse{}, err
	}

	payloadBytes, err := resolvePayloadBytes(request.Payload, request.PayloadBase64)
	if err != nil {
		return domain.RepublishMessageResponse{}, err
	}
	msg := createMessage(strings.TrimSpace(request.Subject), payloadBytes, cloneStringMap(request.Headers))
	if request.UseJetStream {
		if client.js == nil {
			return domain.RepublishMessageResponse{}, errors.New("JetStream is not available on this connection")
		}
		if _, err := client.js.PublishMsg(msg); err != nil {
			return domain.RepublishMessageResponse{}, err
		}
	} else {
		if err := client.nc.PublishMsg(msg); err != nil {
			return domain.RepublishMessageResponse{}, err
		}
	}

	record := domain.MessageRecord{
		ID:                    s.nextID("msg"),
		ConnectionID:          sourceMessage.ConnectionID,
		Direction:             "outbound",
		Kind:                  kindPublish,
		Subject:               msg.Subject,
		Payload:               request.Payload,
		PayloadBase64:         base64.StdEncoding.EncodeToString(msg.Data),
		PayloadEncoding:       normalizePayloadEncoding(request.PayloadEncoding, request.PayloadBase64),
		Headers:               headerToMap(msg.Header),
		Size:                  len(msg.Data),
		JetStream:             request.UseJetStream,
		RelatedMessageID:      sourceMessage.ID,
		ReplaySourceMessageID: sourceMessage.ID,
		AckEligible:           false,
		ReceivedAt:            time.Now(),
	}
	if request.UseJetStream {
		record.JetStreamStream = sourceMessage.JetStreamStream
	}

	s.appendMessage(record, nil)
	return domain.RepublishMessageResponse{Message: record}, nil
}

func (s *Service) Publish(request domain.PublishRequest) error {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return errors.New("select a connection first")
	}
	if strings.TrimSpace(request.Subject) == "" {
		return errors.New("subject is required")
	}

	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return err
	}

	payloadBytes, err := resolvePayloadBytes(request.Payload, request.PayloadBase64)
	if err != nil {
		return err
	}
	headers := cloneStringMap(request.Headers)
	if request.UseMsgID && request.UseJetStream {
		if headers == nil {
			headers = map[string]string{}
		}
		if _, hasID := headers["Nats-Msg-Id"]; !hasID {
			headers["Nats-Msg-Id"] = s.nextID("mid")
		}
	}
	msg := createMessage(strings.TrimSpace(request.Subject), payloadBytes, headers)
	if request.UseJetStream {
		if client.js == nil {
			return errors.New("JetStream is not available on this connection")
		}
		if _, err := client.js.PublishMsg(msg); err != nil {
			return err
		}
	} else {
		if err := client.nc.PublishMsg(msg); err != nil {
			return err
		}
		if err := client.nc.Flush(); err != nil {
			return err
		}
	}

	s.appendMessage(domain.MessageRecord{
		ID:              s.nextID("msg"),
		ConnectionID:    request.ConnectionID,
		Direction:       "outbound",
		Kind:            kindPublish,
		Subject:         msg.Subject,
		Reply:           msg.Reply,
		Payload:         request.Payload,
		PayloadBase64:   base64.StdEncoding.EncodeToString(msg.Data),
		PayloadEncoding: normalizePayloadEncoding(request.PayloadEncoding, request.PayloadBase64),
		Headers:         headerToMap(msg.Header),
		Size:            len(msg.Data),
		JetStream:       request.UseJetStream,
		AckEligible:     false,
		ReceivedAt:      time.Now(),
	}, nil)
	return nil
}

func (s *Service) Request(request domain.RequestMessageRequest) (domain.RequestMessageResponse, error) {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return domain.RequestMessageResponse{}, errors.New("select a connection first")
	}
	if strings.TrimSpace(request.Subject) == "" {
		return domain.RequestMessageResponse{}, errors.New("request subject is required")
	}

	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return domain.RequestMessageResponse{}, err
	}

	timeout := defaultRequestWait
	if request.TimeoutMS > 0 {
		timeout = time.Duration(request.TimeoutMS) * time.Millisecond
		if timeout < minimumRequestWait {
			timeout = minimumRequestWait
		}
	}

	inbox := nats.NewInbox()
	subscription, err := client.nc.SubscribeSync(inbox)
	if err != nil {
		return domain.RequestMessageResponse{}, err
	}
	defer func() {
		_ = subscription.Unsubscribe()
	}()

	requestHeaders := cloneStringMap(request.Headers)
	requestID := ensureRequestID(request.RequestID, requestHeaders)
	payloadBytes, err := resolvePayloadBytes(request.Payload, request.PayloadBase64)
	if err != nil {
		return domain.RequestMessageResponse{}, err
	}
	msg := createMessage(strings.TrimSpace(request.Subject), payloadBytes, requestHeaders)
	msg.Reply = inbox

	requestRecord := domain.MessageRecord{
		ID:                    s.nextID("msg"),
		ConnectionID:          request.ConnectionID,
		Direction:             "outbound",
		Kind:                  kindRequest,
		Subject:               msg.Subject,
		Reply:                 msg.Reply,
		Payload:               request.Payload,
		PayloadBase64:         base64.StdEncoding.EncodeToString(msg.Data),
		PayloadEncoding:       normalizePayloadEncoding(request.PayloadEncoding, request.PayloadBase64),
		Headers:               headerToMap(msg.Header),
		Size:                  len(msg.Data),
		CorrelationID:         requestID,
		ReplaySourceMessageID: strings.TrimSpace(request.ReplaySourceMessageID),
		RequestTimeoutMS:      int(timeout / time.Millisecond),
		RequestStatus:         "pending",
		AckEligible:           false,
		ReceivedAt:            time.Now(),
	}

	startedAt := time.Now()
	if err := client.nc.PublishMsg(msg); err != nil {
		return domain.RequestMessageResponse{}, err
	}
	if err := client.nc.Flush(); err != nil {
		return domain.RequestMessageResponse{}, err
	}

	s.appendMessage(requestRecord, nil)

	responseMessage, err := subscription.NextMsg(timeout)
	if err != nil {
		errMsg := err.Error()
		if errors.Is(err, nats.ErrTimeout) {
			errMsg = fmt.Sprintf("request timed out after %v (no response received)", timeout)
		} else if errors.Is(err, nats.ErrNoResponders) {
			errMsg = "no service is listening on this subject (ErrNoResponders)"
		}
		s.updateMessage(requestRecord.ID, func(record *domain.MessageRecord) {
			record.RequestStatus = "failed"
			record.RequestDurationMS = time.Since(startedAt).Milliseconds()
			record.ErrorMessage = errMsg
		})
		return domain.RequestMessageResponse{}, errors.New(errMsg)
	}
	if responseMessage.Header.Get("Status") == "503" {
		errMsg := "no service is listening on this subject (ErrNoResponders)"
		s.updateMessage(requestRecord.ID, func(record *domain.MessageRecord) {
			record.RequestStatus = "failed"
			record.RequestDurationMS = time.Since(startedAt).Milliseconds()
			record.ErrorMessage = errMsg
		})
		return domain.RequestMessageResponse{}, errors.New(errMsg)
	}

	record := domain.MessageRecord{
		ID:                    s.nextID("msg"),
		ConnectionID:          request.ConnectionID,
		Direction:             "inbound",
		Kind:                  kindResponse,
		Subject:               responseMessage.Subject,
		Reply:                 responseMessage.Reply,
		Payload:               payloadDisplayValue(responseMessage.Data),
		PayloadBase64:         base64.StdEncoding.EncodeToString(responseMessage.Data),
		PayloadEncoding:       payloadDisplayEncoding(responseMessage.Data),
		Headers:               headerToMap(responseMessage.Header),
		Size:                  len(responseMessage.Data),
		CorrelationID:         requestID,
		RelatedMessageID:      requestRecord.ID,
		ReplaySourceMessageID: requestRecord.ReplaySourceMessageID,
		RequestDurationMS:     time.Since(startedAt).Milliseconds(),
		RequestStatus:         "succeeded",
		AckEligible:           false,
		ReceivedAt:            time.Now(),
	}
	if metadata, metadataErr := responseMessage.Metadata(); metadataErr == nil && metadata != nil {
		record.JetStream = true
		record.JetStreamStream = metadata.Stream
		record.JetStreamConsumer = metadata.Consumer
		record.JetStreamSequence = metadata.Sequence.Stream
	}
	if inboundRequestID := requestIDFromHeader(responseMessage.Header); inboundRequestID != "" {
		record.CorrelationID = inboundRequestID
	}

	s.appendMessage(record, nil)
	s.updateMessage(requestRecord.ID, func(existing *domain.MessageRecord) {
		existing.RequestStatus = "succeeded"
		existing.RequestDurationMS = record.RequestDurationMS
		existing.RelatedMessageID = record.ID
		existing.ErrorMessage = ""
	})
	return domain.RequestMessageResponse{Message: record}, nil
}

func (s *Service) Reply(request domain.ReplyRequest) error {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return errors.New("select a connection first")
	}
	if strings.TrimSpace(request.ReplySubject) == "" {
		return errors.New("reply subject is required")
	}

	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return err
	}

	replyHeaders := cloneStringMap(request.Headers)
	requestID := ensureRequestID(request.RequestID, replyHeaders)
	payloadBytes, err := resolvePayloadBytes(request.Payload, request.PayloadBase64)
	if err != nil {
		return err
	}
	msg := createMessage(strings.TrimSpace(request.ReplySubject), payloadBytes, replyHeaders)
	if err := client.nc.PublishMsg(msg); err != nil {
		return err
	}
	if err := client.nc.Flush(); err != nil {
		return err
	}

	s.appendMessage(domain.MessageRecord{
		ID:               s.nextID("msg"),
		ConnectionID:     request.ConnectionID,
		Direction:        "outbound",
		Kind:             kindReply,
		Subject:          msg.Subject,
		Payload:          request.Payload,
		PayloadBase64:    base64.StdEncoding.EncodeToString(msg.Data),
		PayloadEncoding:  normalizePayloadEncoding(request.PayloadEncoding, request.PayloadBase64),
		Headers:          headerToMap(msg.Header),
		Size:             len(msg.Data),
		CorrelationID:    requestID,
		RelatedMessageID: strings.TrimSpace(request.SourceMessageID),
		AckEligible:      false,
		ReceivedAt:       time.Now(),
	}, nil)
	return nil
}

func (s *Service) AckMessage(request domain.MessageActionRequest) error {
	return s.applyMessageAction(request.MessageID, ackStateAcked, func(action *messageAction) error {
		if action == nil || action.ack == nil {
			return errors.New("ack is not available for this message")
		}
		return action.ack()
	})
}

func (s *Service) NakMessage(request domain.MessageActionRequest) error {
	return s.applyMessageAction(request.MessageID, ackStateNacked, func(action *messageAction) error {
		if action == nil || action.nak == nil {
			return errors.New("nak is not available for this message")
		}
		return action.nak()
	})
}

func (s *Service) TermMessage(request domain.MessageActionRequest) error {
	return s.applyMessageAction(request.MessageID, ackStateTermed, func(action *messageAction) error {
		if action == nil || action.term == nil {
			return errors.New("term is not available for this message")
		}
		return action.term()
	})
}

func (s *Service) Subscribe(request domain.SubscribeRequest) (domain.SubscriptionInfo, error) {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return domain.SubscriptionInfo{}, errors.New("select a connection first")
	}
	if strings.TrimSpace(request.Subject) == "" {
		return domain.SubscriptionInfo{}, errors.New("subscription subject is required")
	}

	subscriptionID := s.nextID("sub")
	info, handle, err := s.createSubscriptionHandle(request.ConnectionID, subscriptionID, strings.TrimSpace(request.Subject), strings.TrimSpace(request.QueueGroup))
	if err != nil {
		return domain.SubscriptionInfo{}, err
	}

	s.mu.Lock()
	s.subscriptions[subscriptionID] = info
	s.subscriptionHandles[subscriptionID] = handle
	s.mu.Unlock()

	return *info, nil
}

func (s *Service) UpdateSubscription(request domain.UpdateSubscriptionRequest) (domain.SubscriptionInfo, error) {
	if strings.TrimSpace(request.SubscriptionID) == "" {
		return domain.SubscriptionInfo{}, errors.New("missing subscription ID")
	}
	if strings.TrimSpace(request.Subject) == "" {
		return domain.SubscriptionInfo{}, errors.New("subscription subject is required")
	}

	s.mu.Lock()
	info := s.subscriptions[request.SubscriptionID]
	if info == nil {
		s.mu.Unlock()
		return domain.SubscriptionInfo{}, errors.New("subscription not found")
	}
	updatedInfo := *info
	wasActive := info.Active
	handle := s.subscriptionHandles[request.SubscriptionID]
	delete(s.subscriptionHandles, request.SubscriptionID)
	info.Subject = strings.TrimSpace(request.Subject)
	info.QueueGroup = strings.TrimSpace(request.QueueGroup)
	info.Active = false
	updatedInfo = *info
	s.mu.Unlock()

	if handle != nil {
		_ = handle.Unsubscribe()
	}

	if !wasActive {
		return updatedInfo, nil
	}

	nextInfo, nextHandle, err := s.createSubscriptionHandle(updatedInfo.ConnectionID, updatedInfo.ID, updatedInfo.Subject, updatedInfo.QueueGroup)
	if err != nil {
		return domain.SubscriptionInfo{}, err
	}

	s.mu.Lock()
	existing := s.subscriptions[request.SubscriptionID]
	if existing != nil {
		existing.Subject = nextInfo.Subject
		existing.QueueGroup = nextInfo.QueueGroup
		existing.Active = true
		updatedInfo = *existing
	}
	s.subscriptionHandles[request.SubscriptionID] = nextHandle
	s.mu.Unlock()

	return updatedInfo, nil
}

func (s *Service) SetSubscriptionState(request domain.SetSubscriptionStateRequest) (domain.SubscriptionInfo, error) {
	if strings.TrimSpace(request.SubscriptionID) == "" {
		return domain.SubscriptionInfo{}, errors.New("missing subscription ID")
	}

	s.mu.Lock()
	info := s.subscriptions[request.SubscriptionID]
	if info == nil {
		s.mu.Unlock()
		return domain.SubscriptionInfo{}, errors.New("subscription not found")
	}

	if request.Active == info.Active {
		copyInfo := *info
		s.mu.Unlock()
		return copyInfo, nil
	}

	if !request.Active {
		handle := s.subscriptionHandles[request.SubscriptionID]
		delete(s.subscriptionHandles, request.SubscriptionID)
		info.Active = false
		copyInfo := *info
		s.mu.Unlock()
		if handle != nil {
			_ = handle.Unsubscribe()
		}
		return copyInfo, nil
	}

	copyInfo := *info
	s.mu.Unlock()

	_, handle, err := s.createSubscriptionHandle(copyInfo.ConnectionID, copyInfo.ID, copyInfo.Subject, copyInfo.QueueGroup)
	if err != nil {
		return domain.SubscriptionInfo{}, err
	}

	s.mu.Lock()
	if existing := s.subscriptions[request.SubscriptionID]; existing != nil {
		existing.Active = true
		copyInfo = *existing
	}
	s.subscriptionHandles[request.SubscriptionID] = handle
	s.mu.Unlock()

	return copyInfo, nil
}

func (s *Service) Unsubscribe(subscriptionID string) error {
	if strings.TrimSpace(subscriptionID) == "" {
		return errors.New("missing subscription ID")
	}

	s.mu.Lock()
	handle := s.subscriptionHandles[subscriptionID]
	info := s.subscriptions[subscriptionID]
	delete(s.subscriptionHandles, subscriptionID)
	if info != nil {
		info.Active = false
	}
	s.mu.Unlock()

	if handle != nil {
		return handle.Unsubscribe()
	}
	return nil
}

func (s *Service) createSubscriptionHandle(connectionID string, subscriptionID string, subjectPattern string, queueGroup string) (*domain.SubscriptionInfo, *nats.Subscription, error) {
	client, err := s.requireClient(connectionID)
	if err != nil {
		return nil, nil, err
	}

	handler := func(message *nats.Msg) {
		s.recordInboundMessage(connectionID, subscriptionID, subjectPattern, message)
	}

	var handle *nats.Subscription
	if queueGroup != "" {
		handle, err = client.nc.QueueSubscribe(subjectPattern, queueGroup, handler)
	} else {
		handle, err = client.nc.Subscribe(subjectPattern, handler)
	}
	if err != nil {
		return nil, nil, err
	}
	// Protect against slow consumer disconnection: 10000 messages, 64 MB
	if limitErr := handle.SetPendingLimits(10000, 64*1024*1024); limitErr != nil {
		_ = handle.Unsubscribe()
		return nil, nil, limitErr
	}
	if err = client.nc.Flush(); err != nil {
		_ = handle.Unsubscribe()
		return nil, nil, err
	}

	info := &domain.SubscriptionInfo{
		ID:           subscriptionID,
		ConnectionID: connectionID,
		Subject:      subjectPattern,
		QueueGroup:   queueGroup,
		Active:       true,
		CreatedAt:    time.Now(),
	}

	return info, handle, nil
}

func (s *Service) ListStreams(connectionID string) ([]domain.StreamInfo, error) {
	client, err := s.requireClient(connectionID)
	if err != nil {
		return nil, err
	}
	if client.js == nil {
		return []domain.StreamInfo{}, nil
	}

	streams := make([]domain.StreamInfo, 0)
	for streamName := range client.js.StreamNames() {
		info, err := client.js.StreamInfo(streamName)
		if err != nil {
			continue
		}
		streams = append(streams, domain.StreamInfo{
			Name:      info.Config.Name,
			Subjects:  append([]string(nil), info.Config.Subjects...),
			Messages:  info.State.Msgs,
			Bytes:     info.State.Bytes,
			Consumers: info.State.Consumers,
			Storage:   fmt.Sprint(info.Config.Storage),
			Replicas:  info.Config.Replicas,
		})
	}

	sort.Slice(streams, func(i, j int) bool {
		return streams[i].Name < streams[j].Name
	})
	return streams, nil
}

func (s *Service) ListConsumers(connectionID string, streamName string) ([]domain.ConsumerInfo, error) {
	if strings.TrimSpace(streamName) == "" {
		return []domain.ConsumerInfo{}, nil
	}

	client, err := s.requireClient(connectionID)
	if err != nil {
		return nil, err
	}
	if client.js == nil {
		return []domain.ConsumerInfo{}, nil
	}

	consumers := make([]domain.ConsumerInfo, 0)
	for consumerName := range client.js.ConsumerNames(streamName) {
		info, err := client.js.ConsumerInfo(streamName, consumerName)
		if err != nil {
			continue
		}
		consumers = append(consumers, consumerInfoToDomain(streamName, info))
	}

	sort.Slice(consumers, func(i, j int) bool {
		return consumers[i].Name < consumers[j].Name
	})
	return consumers, nil
}

func (s *Service) UpsertStream(request domain.StreamUpsertRequest) (domain.StreamInfo, error) {
	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return domain.StreamInfo{}, err
	}
	if client.js == nil {
		return domain.StreamInfo{}, errors.New("JetStream is not available on this connection")
	}

	name := strings.TrimSpace(request.Name)
	if name == "" {
		return domain.StreamInfo{}, errors.New("stream name is required")
	}

	subjects := sanitizeSubjects(request.Subjects)
	if len(subjects) == 0 {
		return domain.StreamInfo{}, errors.New("at least one subject is required")
	}

	storageType, err := parseStorageType(request.Storage)
	if err != nil {
		return domain.StreamInfo{}, err
	}

	replicas := request.Replicas
	if replicas <= 0 {
		replicas = 1
	}

	if existing, err := client.js.StreamInfo(name); err == nil {
		cfg := existing.Config
		cfg.Subjects = subjects
		cfg.Storage = storageType
		cfg.Replicas = replicas
		applyStreamConfigExtras(&cfg, request)
		updated, updateErr := client.js.UpdateStream(&cfg)
		if updateErr != nil {
			return domain.StreamInfo{}, updateErr
		}
		return streamInfoToDomain(updated), nil
	}

	streamCfg := &nats.StreamConfig{
		Name:     name,
		Subjects: subjects,
		Storage:  storageType,
		Replicas: replicas,
	}
	applyStreamConfigExtras(streamCfg, request)
	created, err := client.js.AddStream(streamCfg)
	if err != nil {
		return domain.StreamInfo{}, err
	}
	return streamInfoToDomain(created), nil
}

func (s *Service) DeleteStream(request domain.StreamDeleteRequest) error {
	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return err
	}
	if client.js == nil {
		return errors.New("JetStream is not available on this connection")
	}

	streamName := strings.TrimSpace(request.Name)
	if streamName == "" {
		return errors.New("stream name is required")
	}
	return client.js.DeleteStream(streamName)
}

func (s *Service) UpsertConsumer(request domain.ConsumerUpsertRequest) (domain.ConsumerInfo, error) {
	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return domain.ConsumerInfo{}, err
	}
	if client.js == nil {
		return domain.ConsumerInfo{}, errors.New("JetStream is not available on this connection")
	}

	streamName := strings.TrimSpace(request.StreamName)
	consumerName := strings.TrimSpace(request.Name)
	if streamName == "" {
		return domain.ConsumerInfo{}, errors.New("stream name is required")
	}
	if consumerName == "" {
		return domain.ConsumerInfo{}, errors.New("consumer name is required")
	}

	ackPolicy, err := parseAckPolicy(request.AckPolicy)
	if err != nil {
		return domain.ConsumerInfo{}, err
	}
	deliverPolicy, err := parseDeliverPolicy(request.DeliverPolicy)
	if err != nil {
		return domain.ConsumerInfo{}, err
	}

	cfg := &nats.ConsumerConfig{
		Durable:       consumerName,
		AckPolicy:     ackPolicy,
		DeliverPolicy: deliverPolicy,
		FilterSubject: strings.TrimSpace(request.FilterSubject),
	}
	if ds := strings.TrimSpace(request.DeliverSubject); ds != "" {
		cfg.DeliverSubject = ds
	}
	if request.MaxDeliver > 0 {
		cfg.MaxDeliver = request.MaxDeliver
	}
	if request.AckWait > 0 {
		cfg.AckWait = time.Duration(request.AckWait)
	}
	if request.MaxAckPending > 0 {
		cfg.MaxAckPending = request.MaxAckPending
	}

	if existing, err := client.js.ConsumerInfo(streamName, consumerName); err == nil {
		existingCfg := existing.Config
		existingCfg.Durable = consumerName
		existingCfg.AckPolicy = ackPolicy
		existingCfg.DeliverPolicy = deliverPolicy
		existingCfg.FilterSubject = strings.TrimSpace(request.FilterSubject)
		if ds := strings.TrimSpace(request.DeliverSubject); ds != "" {
			existingCfg.DeliverSubject = ds
		}
		if request.MaxDeliver > 0 {
			existingCfg.MaxDeliver = request.MaxDeliver
		}
		if request.AckWait > 0 {
			existingCfg.AckWait = time.Duration(request.AckWait)
		}
		if request.MaxAckPending > 0 {
			existingCfg.MaxAckPending = request.MaxAckPending
		}
		updated, updateErr := client.js.UpdateConsumer(streamName, &existingCfg)
		if updateErr != nil {
			return domain.ConsumerInfo{}, updateErr
		}
		return consumerInfoToDomain(streamName, updated), nil
	}

	created, err := client.js.AddConsumer(streamName, cfg)
	if err != nil {
		return domain.ConsumerInfo{}, err
	}
	return consumerInfoToDomain(streamName, created), nil
}

func (s *Service) DeleteConsumer(request domain.ConsumerDeleteRequest) error {
	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return err
	}
	if client.js == nil {
		return errors.New("JetStream is not available on this connection")
	}

	streamName := strings.TrimSpace(request.StreamName)
	consumerName := strings.TrimSpace(request.ConsumerName)
	if streamName == "" {
		return errors.New("stream name is required")
	}
	if consumerName == "" {
		return errors.New("consumer name is required")
	}
	return client.js.DeleteConsumer(streamName, consumerName)
}

func (s *Service) FetchConsumerMessages(request domain.ConsumerFetchRequest) (domain.ConsumerFetchResponse, error) {
	client, err := s.requireClient(request.ConnectionID)
	if err != nil {
		return domain.ConsumerFetchResponse{}, err
	}
	if client.js == nil {
		return domain.ConsumerFetchResponse{}, errors.New("JetStream is not available on this connection")
	}

	streamName := strings.TrimSpace(request.StreamName)
	consumerName := strings.TrimSpace(request.ConsumerName)
	if streamName == "" {
		return domain.ConsumerFetchResponse{}, errors.New("stream name is required")
	}
	if consumerName == "" {
		return domain.ConsumerFetchResponse{}, errors.New("consumer name is required")
	}

	consumerInfo, err := client.js.ConsumerInfo(streamName, consumerName)
	if err != nil {
		return domain.ConsumerFetchResponse{}, err
	}
	if consumerInfo != nil && consumerInfo.Config.DeliverSubject != "" {
		return domain.ConsumerFetchResponse{}, errors.New("selected consumer is push-based and cannot be fetched manually")
	}

	batchSize := request.BatchSize
	if batchSize <= 0 {
		batchSize = defaultFetchBatch
	}
	if batchSize > maximumFetchBatch {
		batchSize = maximumFetchBatch
	}

	maxWait := defaultFetchWait
	if request.MaxWaitMS > 0 {
		maxWait = time.Duration(request.MaxWaitMS) * time.Millisecond
		if maxWait < minimumFetchWait {
			maxWait = minimumFetchWait
		}
	}

	subscription, err := client.js.PullSubscribe("", consumerName, nats.Bind(streamName, consumerName))
	if err != nil {
		return domain.ConsumerFetchResponse{}, err
	}
	defer func() {
		_ = subscription.Unsubscribe()
	}()

	messages, err := subscription.Fetch(batchSize, nats.MaxWait(maxWait))
	if err != nil {
		return domain.ConsumerFetchResponse{}, err
	}

	records := make([]domain.MessageRecord, 0, len(messages))
	for _, msg := range messages {
		record, action := s.buildInboundRecord(request.ConnectionID, "", consumerInfo.Config.FilterSubject, msg)
		s.appendMessage(record, action)
		records = append(records, record)
	}

	return domain.ConsumerFetchResponse{Messages: records}, nil
}

func (s *Service) Close() {
	s.mu.Lock()
	clients := make([]*nats.Conn, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client.nc)
	}
	s.clients = map[string]*clientRuntime{}
	s.subscriptionHandles = map[string]*nats.Subscription{}
	s.messageActions = map[string]*messageAction{}
	for _, subscription := range s.subscriptions {
		subscription.Active = false
	}
	s.mu.Unlock()

	for _, connection := range clients {
		_ = connection.Drain()
	}
}

func (s *Service) recordInboundMessage(connectionID string, subscriptionID string, subscriptionPattern string, message *nats.Msg) {
	record, action := s.buildInboundRecord(connectionID, subscriptionID, subscriptionPattern, message)
	s.appendMessage(record, action)

	s.mu.Lock()
	if subscription := s.subscriptions[subscriptionID]; subscription != nil {
		subscription.MessageCount++
	}
	s.mu.Unlock()
}

func (s *Service) buildInboundRecord(connectionID string, subscriptionID string, subscriptionPattern string, message *nats.Msg) (domain.MessageRecord, *messageAction) {
	kind := kindMessage
	if message.Reply != "" {
		kind = kindRequest
	}

	record := domain.MessageRecord{
		ID:                  s.nextID("msg"),
		ConnectionID:        connectionID,
		SubscriptionID:      subscriptionID,
		SubscriptionPattern: subscriptionPattern,
		Direction:           "inbound",
		Kind:                kind,
		Subject:             message.Subject,
		Reply:               message.Reply,
		Payload:             payloadDisplayValue(message.Data),
		PayloadBase64:       base64.StdEncoding.EncodeToString(message.Data),
		PayloadEncoding:     payloadDisplayEncoding(message.Data),
		Headers:             headerToMap(message.Header),
		Size:                len(message.Data),
		CorrelationID:       requestIDFromHeader(message.Header),
		AckEligible:         false,
		ReceivedAt:          time.Now(),
	}

	var action *messageAction
	if metadata, err := message.Metadata(); err == nil && metadata != nil {
		record.JetStream = true
		record.JetStreamStream = metadata.Stream
		record.JetStreamConsumer = metadata.Consumer
		record.JetStreamSequence = metadata.Sequence.Stream
		record.AckEligible = true
		record.AckState = ackStatePending
		action = &messageAction{
			ack:  func() error { return message.Ack() },
			nak:  func() error { return message.Nak() },
			term: func() error { return message.Term() },
		}
	}

	return record, action
}

func (s *Service) appendMessage(record domain.MessageRecord, action *messageAction) {
	s.mu.Lock()
	s.appendMessageLocked(record, action)
	store := s.messageStore
	retention := s.logRetention
	s.mu.Unlock()

	if store != nil {
		if err := store.UpsertMessage(record); err != nil {
			log.Printf("persist message failed: %v", err)
		} else if err := store.ApplyLogRetention(retention); err != nil {
			log.Printf("apply message retention failed: %v", err)
		}
	}

	if s.ctx != nil {
		wailsruntime.EventsEmit(s.ctx, "natsx:message", record)
	}
}

func (s *Service) appendMessageLocked(record domain.MessageRecord, action *messageAction) {
	s.messages = append([]domain.MessageRecord{record}, s.messages...)
	s.messageBytes += estimateMessageBytes(record)
	if action != nil {
		s.messageActions[record.ID] = action
	}
	s.trimMessagesLocked()
}

func (s *Service) trimMessagesLocked() {
	settings := normalizeLogRetentionSettings(s.logRetention)
	s.logRetention = settings

	if len(s.messages) == 0 {
		s.messageBytes = 0
		return
	}

	for len(s.messages) > settings.MaxEntries || s.messageBytes > settings.MaxTotalBytes {
		removed := s.messages[len(s.messages)-1]
		s.messages = s.messages[:len(s.messages)-1]
		s.messageBytes -= estimateMessageBytes(removed)
		delete(s.messageActions, removed.ID)
	}

	if s.messageBytes < 0 {
		s.messageBytes = 0
	}
}

func estimateMessageBytes(record domain.MessageRecord) int64 {
	size := int64(record.Size)
	if size <= 0 {
		size = int64(len(record.Payload))
	}

	size += int64(len(record.ID) + len(record.ConnectionID) + len(record.Subject) + len(record.Reply))
	size += int64(len(record.PayloadBase64) + len(record.PayloadEncoding))
	size += int64(len(record.CorrelationID) + len(record.RelatedMessageID) + len(record.ReplaySourceMessageID))
	size += int64(len(record.ErrorMessage) + len(record.SubscriptionID) + len(record.SubscriptionPattern))
	size += int64(len(record.JetStreamStream) + len(record.JetStreamConsumer))

	for key, values := range record.Headers {
		size += int64(len(key))
		for _, value := range values {
			size += int64(len(value))
		}
	}

	return size
}

func recalculateMessageBytes(messages []domain.MessageRecord) int64 {
	var total int64
	for _, message := range messages {
		total += estimateMessageBytes(message)
	}
	return total
}

func (s *Service) updateMessage(messageID string, updater func(record *domain.MessageRecord)) {
	if strings.TrimSpace(messageID) == "" || updater == nil {
		return
	}

	var updatedRecord *domain.MessageRecord
	var store messageStore
	var retention domain.LogRetentionSettings
	s.mu.Lock()
	for index := range s.messages {
		if s.messages[index].ID == messageID {
			previousBytes := estimateMessageBytes(s.messages[index])
			updater(&s.messages[index])
			nextBytes := estimateMessageBytes(s.messages[index])
			s.messageBytes += nextBytes - previousBytes
			if s.messageBytes < 0 {
				s.messageBytes = 0
			}
			recordCopy := s.messages[index]
			updatedRecord = &recordCopy
			store = s.messageStore
			retention = s.logRetention
			break
		}
	}
	s.mu.Unlock()

	if updatedRecord != nil && store != nil {
		if err := store.UpsertMessage(*updatedRecord); err != nil {
			log.Printf("persist updated message failed: %v", err)
		} else if err := store.ApplyLogRetention(retention); err != nil {
			log.Printf("apply message retention failed: %v", err)
		}
	}
}

func (s *Service) applyMessageAction(messageID string, nextState string, executor func(action *messageAction) error) error {
	if strings.TrimSpace(messageID) == "" {
		return errors.New("missing message ID")
	}

	s.mu.RLock()
	action := s.messageActions[messageID]
	s.mu.RUnlock()
	if action == nil {
		return errors.New("no pending ack action for this message")
	}

	if err := executor(action); err != nil {
		return err
	}

	s.mu.Lock()
	delete(s.messageActions, messageID)
	s.mu.Unlock()

	s.updateMessage(messageID, func(record *domain.MessageRecord) {
		record.AckState = nextState
	})
	return nil
}

func (s *Service) saveProfilesLocked() error {
	if s.store == nil {
		return nil
	}

	profiles := make([]domain.ConnectionProfile, 0, len(s.profiles))
	for _, profile := range s.profiles {
		copyProfile := *profile
		copyProfile.Connected = false
		profiles = append(profiles, copyProfile)
	}

	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].UpdatedAt.After(profiles[j].UpdatedAt)
	})

	return s.store.Save(profiles)
}

func (s *Service) requireClient(connectionID string) (*clientRuntime, error) {
	if strings.TrimSpace(connectionID) == "" {
		return nil, errors.New("select a connection first")
	}

	s.mu.RLock()
	client := s.clients[connectionID]
	s.mu.RUnlock()
	if client == nil {
		return nil, errors.New("connection is not established")
	}
	return client, nil
}

func (s *Service) nextID(prefix string) string {
	value := atomic.AddUint64(&s.sequence, 1)
	return fmt.Sprintf("%s_%d", prefix, value)
}

func parseImportConnectionsContent(content string) ([]domain.ConnectionInput, error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return nil, errors.New("import content is required")
	}

	var inputs []domain.ConnectionInput
	if err := json.Unmarshal([]byte(trimmed), &inputs); err == nil {
		return inputs, nil
	}

	var profiles []domain.ConnectionProfile
	if err := json.Unmarshal([]byte(trimmed), &profiles); err == nil {
		converted := make([]domain.ConnectionInput, 0, len(profiles))
		for _, profile := range profiles {
			converted = append(converted, domain.ConnectionInput{
				ID:          profile.ID,
				Name:        profile.Name,
				URL:         profile.URL,
				AuthMode:    profile.AuthMode,
				Username:    profile.Username,
				Password:    profile.Password,
				Token:       profile.Token,
				CertFile:    profile.CertFile,
				KeyFile:     profile.KeyFile,
				CAFile:      profile.CAFile,
				Description: profile.Description,
			})
		}
		return converted, nil
	}

	var wrapped struct {
		Connections []domain.ConnectionInput `json:"connections"`
	}
	if err := json.Unmarshal([]byte(trimmed), &wrapped); err == nil && len(wrapped.Connections) > 0 {
		return wrapped.Connections, nil
	}

	return nil, errors.New("unsupported import JSON format")
}

func maskConnectionProfiles(profiles []domain.ConnectionProfile, maskSensitive bool) []domain.ConnectionProfile {
	if !maskSensitive {
		return profiles
	}

	masked := make([]domain.ConnectionProfile, len(profiles))
	copy(masked, profiles)
	for index := range masked {
		if masked[index].Password != "" {
			masked[index].Password = "***MASKED***"
		}
		if masked[index].Token != "" {
			masked[index].Token = "***MASKED***"
		}
		if masked[index].NKeyOrSeed != "" {
			masked[index].NKeyOrSeed = "***MASKED***"
		}
	}
	return masked
}

func snapshotConnections(profiles map[string]*domain.ConnectionProfile, clients map[string]*clientRuntime) []domain.ConnectionProfile {
	connections := make([]domain.ConnectionProfile, 0, len(profiles))
	for _, profile := range profiles {
		copyProfile := *profile
		copyProfile.Connected = clients[profile.ID] != nil
		connections = append(connections, copyProfile)
	}
	sort.Slice(connections, func(i, j int) bool {
		if connections[i].Connected != connections[j].Connected {
			return connections[i].Connected
		}
		return connections[i].UpdatedAt.After(connections[j].UpdatedAt)
	})
	return connections
}

func createMessage(subject string, payload []byte, headers map[string]string) *nats.Msg {
	msg := &nats.Msg{Subject: subject, Data: append([]byte(nil), payload...)}
	if len(headers) == 0 {
		return msg
	}

	msg.Header = nats.Header{}
	for key, value := range headers {
		if strings.TrimSpace(key) == "" {
			continue
		}
		msg.Header.Set(strings.TrimSpace(key), value)
	}
	return msg
}

func resolvePayloadBytes(payload string, payloadBase64 string) ([]byte, error) {
	trimmedBase64 := strings.TrimSpace(payloadBase64)
	if trimmedBase64 == "" {
		return []byte(payload), nil
	}

	decoded, err := base64.StdEncoding.DecodeString(trimmedBase64)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 payload: %w", err)
	}
	return decoded, nil
}

func payloadDisplayValue(data []byte) string {
	if utf8.Valid(data) {
		return string(data)
	}
	return base64.StdEncoding.EncodeToString(data)
}

func payloadDisplayEncoding(data []byte) string {
	if utf8.Valid(data) {
		return "text"
	}
	return "base64"
}

func normalizePayloadEncoding(value string, payloadBase64 string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return strings.ToLower(trimmed)
	}
	if strings.TrimSpace(payloadBase64) != "" {
		return "base64"
	}
	return "text"
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}

	output := make(map[string]string, len(input))
	for key, value := range input {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		output[trimmedKey] = value
	}
	return output
}

func ensureRequestID(explicitRequestID string, headers map[string]string) string {
	requestID := strings.TrimSpace(explicitRequestID)
	if requestID == "" {
		for key, value := range headers {
			if strings.EqualFold(strings.TrimSpace(key), requestIDHeader) && strings.TrimSpace(value) != "" {
				requestID = strings.TrimSpace(value)
				break
			}
		}
	}
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", time.Now().UnixNano())
	}
	if headers != nil {
		headers[requestIDHeader] = requestID
	}
	return requestID
}

func requestIDFromHeader(header nats.Header) string {
	if len(header) == 0 {
		return ""
	}
	for key, values := range header {
		if strings.EqualFold(strings.TrimSpace(key), requestIDHeader) && len(values) > 0 {
			return strings.TrimSpace(values[0])
		}
	}
	return ""
}

func headerToMap(header nats.Header) map[string][]string {
	if len(header) == 0 {
		return nil
	}
	output := make(map[string][]string, len(header))
	for key, values := range header {
		copied := make([]string, len(values))
		copy(copied, values)
		output[key] = copied
	}
	return output
}

func normalizeAuthMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case authModeUser:
		return authModeUser
	case authModeToken:
		return authModeToken
	case authModeTLS:
		return authModeTLS
	case authModeNKey:
		return authModeNKey
	case authModeCreds:
		return authModeCreds
	default:
		return authModeNone
	}
}

func applyAuthMode(profile *domain.ConnectionProfile) {
	if profile == nil {
		return
	}

	profile.AuthMode = normalizeAuthMode(profile.AuthMode)

	switch profile.AuthMode {
	case authModeUser:
		profile.Token = ""
		profile.CertFile = ""
		profile.KeyFile = ""
		profile.CAFile = ""
		profile.NKeyOrSeed = ""
		profile.CredsFile = ""
	case authModeToken:
		profile.Username = ""
		profile.Password = ""
		profile.CertFile = ""
		profile.KeyFile = ""
		profile.CAFile = ""
		profile.NKeyOrSeed = ""
		profile.CredsFile = ""
	case authModeTLS:
		profile.Username = ""
		profile.Password = ""
		profile.Token = ""
		profile.NKeyOrSeed = ""
		profile.CredsFile = ""
	case authModeNKey:
		profile.Username = ""
		profile.Password = ""
		profile.Token = ""
		profile.CertFile = ""
		profile.KeyFile = ""
		profile.CAFile = ""
		profile.CredsFile = ""
	case authModeCreds:
		profile.Username = ""
		profile.Password = ""
		profile.Token = ""
		profile.CertFile = ""
		profile.KeyFile = ""
		profile.CAFile = ""
		profile.NKeyOrSeed = ""
	default:
		profile.Username = ""
		profile.Password = ""
		profile.Token = ""
		profile.CertFile = ""
		profile.KeyFile = ""
		profile.CAFile = ""
		profile.NKeyOrSeed = ""
		profile.CredsFile = ""
	}
}

func buildAuthOptions(profile domain.ConnectionProfile) ([]nats.Option, error) {
	switch normalizeAuthMode(profile.AuthMode) {
	case authModeUser:
		if profile.Username == "" {
			return nil, errors.New("username is required for user auth")
		}
		return []nats.Option{nats.UserInfo(profile.Username, profile.Password)}, nil
	case authModeToken:
		if profile.Token == "" {
			return nil, errors.New("token is required for token auth")
		}
		return []nats.Option{nats.Token(profile.Token)}, nil
	case authModeTLS:
		tlsConfig, err := buildTLSConfig(profile)
		if err != nil {
			return nil, err
		}
		return []nats.Option{nats.Secure(tlsConfig)}, nil
	case authModeNKey:
		if profile.NKeyOrSeed == "" {
			return nil, errors.New("nkey seed is required for nkey auth")
		}
		opt, err := nats.NkeyOptionFromSeed(profile.NKeyOrSeed)
		if err != nil {
			return nil, fmt.Errorf("invalid nkey seed: %w", err)
		}
		return []nats.Option{opt}, nil
	case authModeCreds:
		if profile.CredsFile == "" {
			return nil, errors.New("credentials file is required for creds auth")
		}
		return []nats.Option{nats.UserCredentials(profile.CredsFile)}, nil
	default:
		return nil, nil
	}
}

func buildTLSConfig(profile domain.ConnectionProfile) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}

	if profile.CAFile != "" {
		pemBytes, err := os.ReadFile(profile.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read ca file failed: %w", err)
		}
		pool, err := x509.SystemCertPool()
		if err != nil || pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pemBytes) {
			return nil, errors.New("append ca cert failed")
		}
		cfg.RootCAs = pool
	}

	if profile.CertFile != "" || profile.KeyFile != "" {
		if profile.CertFile == "" || profile.KeyFile == "" {
			return nil, errors.New("cert file and key file must be provided together")
		}
		certificate, err := tls.LoadX509KeyPair(profile.CertFile, profile.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("load client cert failed: %w", err)
		}
		cfg.Certificates = []tls.Certificate{certificate}
	}

	return cfg, nil
}

func applyStreamConfigExtras(cfg *nats.StreamConfig, request domain.StreamUpsertRequest) {
	if request.MaxAge > 0 {
		cfg.MaxAge = time.Duration(request.MaxAge)
	}
	if request.MaxMsgs > 0 {
		cfg.MaxMsgs = request.MaxMsgs
	}
	if request.MaxBytes > 0 {
		cfg.MaxBytes = request.MaxBytes
	}
	if request.MaxMsgSize > 0 {
		cfg.MaxMsgSize = request.MaxMsgSize
	}
	if request.DuplicateWindow > 0 {
		cfg.Duplicates = time.Duration(request.DuplicateWindow)
	}
	switch strings.TrimSpace(request.Retention) {
	case "LimitsPolicy":
		cfg.Retention = nats.LimitsPolicy
	case "InterestPolicy":
		cfg.Retention = nats.InterestPolicy
	case "WorkQueuePolicy":
		cfg.Retention = nats.WorkQueuePolicy
	}
	switch strings.TrimSpace(request.Discard) {
	case "DiscardNew":
		cfg.Discard = nats.DiscardNew
	case "DiscardOld":
		cfg.Discard = nats.DiscardOld
	}
}

func streamInfoToDomain(info *nats.StreamInfo) domain.StreamInfo {
	if info == nil {
		return domain.StreamInfo{}
	}
	return domain.StreamInfo{
		Name:      info.Config.Name,
		Subjects:  append([]string(nil), info.Config.Subjects...),
		Messages:  info.State.Msgs,
		Bytes:     info.State.Bytes,
		Consumers: info.State.Consumers,
		Storage:   fmt.Sprint(info.Config.Storage),
		Replicas:  info.Config.Replicas,
	}
}

func consumerInfoToDomain(streamName string, info *nats.ConsumerInfo) domain.ConsumerInfo {
	name := info.Name
	if name == "" {
		name = info.Config.Durable
	}
	return domain.ConsumerInfo{
		Name:           name,
		StreamName:     streamName,
		AckPolicy:      fmt.Sprint(info.Config.AckPolicy),
		DeliverPolicy:  fmt.Sprint(info.Config.DeliverPolicy),
		FilterSubject:  info.Config.FilterSubject,
		DeliverSubject: info.Config.DeliverSubject,
		IsPullMode:     info.Config.DeliverSubject == "",
		NumPending:     info.NumPending,
		NumWaiting:     info.NumWaiting,
		NumAckPending:  info.NumAckPending,
		MaxDeliver:     info.Config.MaxDeliver,
		AckWait:        int64(info.Config.AckWait),
		MaxAckPending:  info.Config.MaxAckPending,
	}
}

func sanitizeSubjects(subjects []string) []string {
	result := make([]string, 0, len(subjects))
	for _, subject := range subjects {
		trimmed := strings.TrimSpace(subject)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func parseStorageType(value string) (nats.StorageType, error) {
	switch strings.TrimSpace(value) {
	case "", "FileStorage":
		return nats.FileStorage, nil
	case "MemoryStorage":
		return nats.MemoryStorage, nil
	default:
		return nats.FileStorage, fmt.Errorf("unsupported storage type: %s", value)
	}
}

func parseAckPolicy(value string) (nats.AckPolicy, error) {
	switch strings.TrimSpace(value) {
	case "", "AckExplicitPolicy":
		return nats.AckExplicitPolicy, nil
	case "AckAllPolicy":
		return nats.AckAllPolicy, nil
	case "AckNonePolicy":
		return nats.AckNonePolicy, nil
	default:
		return nats.AckExplicitPolicy, fmt.Errorf("unsupported ack policy: %s", value)
	}
}

func parseDeliverPolicy(value string) (nats.DeliverPolicy, error) {
	switch strings.TrimSpace(value) {
	case "", "DeliverAllPolicy":
		return nats.DeliverAllPolicy, nil
	case "DeliverLastPolicy":
		return nats.DeliverLastPolicy, nil
	case "DeliverNewPolicy":
		return nats.DeliverNewPolicy, nil
	case "DeliverByStartSequencePolicy":
		return nats.DeliverByStartSequencePolicy, nil
	case "DeliverByStartTimePolicy":
		return nats.DeliverByStartTimePolicy, nil
	case "DeliverLastPerSubjectPolicy":
		return nats.DeliverLastPerSubjectPolicy, nil
	default:
		return nats.DeliverAllPolicy, fmt.Errorf("unsupported deliver policy: %s", value)
	}
}
