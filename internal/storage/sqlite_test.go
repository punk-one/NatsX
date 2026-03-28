package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"natsx/internal/domain"
)

func TestSQLiteStorePersistsData(t *testing.T) {
	tempDir := t.TempDir()
	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd failed: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(originalWD)
	})

	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("chdir failed: %v", err)
	}

	store, err := NewSQLiteStore()
	if err != nil {
		t.Fatalf("create store failed: %v", err)
	}

	profiles := []domain.ConnectionProfile{{
		ID:        "conn_1",
		Name:      "Demo",
		URL:       "nats://127.0.0.1:4222",
		UpdatedAt: time.Now(),
	}}
	if err := store.Save(profiles); err != nil {
		t.Fatalf("save connections failed: %v", err)
	}

	settings := domain.AppSettings{
		AutoCheckUpdate:       false,
		AutoResubscribe:       true,
		MultiSubjectSubscribe: true,
		MaxReconnectTimes:     5,
		MaxPayloadSize:        256,
		ThemeMode:             "dark",
		Language:              "en-US",
		LogRetention: domain.LogRetentionSettings{
			MaxEntries:    1000,
			MaxTotalBytes: 100 * 1024 * 1024,
		},
	}
	if err := store.SaveAppSettings(settings); err != nil {
		t.Fatalf("save settings failed: %v", err)
	}

	updateState := domain.UpdateState{
		DownloadedPackage: &domain.UpdateDownloadResult{
			Path:          filepath.Join(tempDir, "downloads", "NatsX-1.0.2-windows-amd64-setup.exe"),
			AssetName:     "NatsX-1.0.2-windows-amd64-setup.exe",
			LatestVersion: "1.0.2",
			ReleaseURL:    "https://github.com/punk-one/NatsX/releases/tag/v1.0.2",
			DownloadURL:   "https://github.com/punk-one/NatsX/releases/download/v1.0.2/NatsX-1.0.2-windows-amd64-setup.exe",
			Bytes:         64 * 1024 * 1024,
			DownloadedAt:  time.Now(),
		},
	}
	if err := store.SaveUpdateState(updateState); err != nil {
		t.Fatalf("save update state failed: %v", err)
	}

	record := domain.MessageRecord{
		ID:           "msg_1",
		ConnectionID: "conn_1",
		Direction:    "outbound",
		Kind:         "publish",
		Subject:      "demo.subject",
		Payload:      "hello",
		Size:         5,
		ReceivedAt:   time.Now(),
	}
	if err := store.UpsertMessage(record); err != nil {
		t.Fatalf("save message failed: %v", err)
	}

	storePath := store.Path()
	if err := store.Close(); err != nil {
		t.Fatalf("close store failed: %v", err)
	}

	info, err := os.Stat(storePath)
	if err != nil {
		t.Fatalf("stat db failed: %v", err)
	}
	if info.Size() <= 0 {
		t.Fatalf("expected sqlite db to be non-empty, got %d bytes (%s)", info.Size(), storePath)
	}

	reopened, err := NewSQLiteStore()
	if err != nil {
		t.Fatalf("reopen store failed: %v", err)
	}
	defer reopened.Close()

	loadedProfiles, err := reopened.Load()
	if err != nil {
		t.Fatalf("load connections failed: %v", err)
	}
	if len(loadedProfiles) != 1 || loadedProfiles[0].ID != profiles[0].ID {
		t.Fatalf("unexpected loaded profiles: %#v", loadedProfiles)
	}

	loadedSettings, err := reopened.LoadAppSettings()
	if err != nil {
		t.Fatalf("load settings failed: %v", err)
	}
	if loadedSettings.ThemeMode != settings.ThemeMode ||
		loadedSettings.Language != settings.Language ||
		loadedSettings.MaxReconnectTimes != settings.MaxReconnectTimes {
		t.Fatalf("unexpected loaded settings: %#v", loadedSettings)
	}

	loadedUpdateState, err := reopened.LoadUpdateState()
	if err != nil {
		t.Fatalf("load update state failed: %v", err)
	}
	if loadedUpdateState.DownloadedPackage == nil || loadedUpdateState.DownloadedPackage.Path != updateState.DownloadedPackage.Path {
		t.Fatalf("unexpected loaded update state: %#v", loadedUpdateState)
	}

	loadedMessages, err := reopened.LoadMessages()
	if err != nil {
		t.Fatalf("load messages failed: %v", err)
	}
	if len(loadedMessages) != 1 || loadedMessages[0].ID != record.ID {
		t.Fatalf("unexpected loaded messages: %#v", loadedMessages)
	}

	expectedDBPath := filepath.Join(tempDir, "database", databaseFileName)
	if reopened.Path() != expectedDBPath {
		t.Fatalf("expected db path %s, got %s", expectedDBPath, reopened.Path())
	}
}
