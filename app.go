package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"natsx/internal/domain"
	natsclient "natsx/internal/natsclient"
	"natsx/internal/storage"
	"natsx/internal/updatechecker"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx     context.Context
	service *natsclient.Service
	dbStore *storage.SQLiteStore
}

const currentAppVersion = "1.0.3"

type WindowState struct {
	Maximised  bool `json:"maximised"`
	Minimised  bool `json:"minimised"`
	Fullscreen bool `json:"fullscreen"`
	Normal     bool `json:"normal"`
}

func NewApp() *App {
	service := natsclient.NewService()
	return &App{service: service}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.service.SetContext(ctx)
	a.initialisePersistence()

	go func() {
		time.Sleep(220 * time.Millisecond)
		if a.ctx != nil {
			wailsruntime.WindowMaximise(a.ctx)
		}
	}()
}

func (a *App) initialisePersistence() {
	store, err := storage.NewSQLiteStore()
	if err != nil {
		log.Printf("init sqlite store failed: %v", err)
		return
	}

	a.dbStore = store
	log.Printf("using sqlite store: %s", store.Path())

	if migration, err := store.MigrateLegacyJSON("NatsX"); err != nil {
		log.Printf("migrate legacy json failed: %v", err)
	} else {
		if migration.ConnectionsMigrated {
			log.Printf("migrated legacy connections from %s", migration.ConnectionSource)
		}
		if migration.SettingsMigrated {
			log.Printf("migrated legacy settings from %s", migration.SettingsSource)
		}
	}

	if err := a.service.UseStore(store); err != nil {
		log.Printf("load persisted connections failed: %v", err)
	}
	if err := a.service.UseSettingsStore(store); err != nil {
		log.Printf("load persisted settings failed: %v", err)
	}
	if err := a.service.UseMessageStore(store); err != nil {
		log.Printf("load persisted messages failed: %v", err)
	}
}

func (a *App) shutdown(context.Context) {
	a.service.Close()
	if a.dbStore != nil {
		_ = a.dbStore.Close()
	}
}

func (a *App) GetWindowState() WindowState {
	if a.ctx == nil {
		return WindowState{Normal: true}
	}

	return WindowState{
		Maximised:  wailsruntime.WindowIsMaximised(a.ctx),
		Minimised:  wailsruntime.WindowIsMinimised(a.ctx),
		Fullscreen: wailsruntime.WindowIsFullscreen(a.ctx),
		Normal:     wailsruntime.WindowIsNormal(a.ctx),
	}
}

func (a *App) WindowMinimise() error {
	if a.ctx == nil {
		return fmt.Errorf("application context is not ready")
	}
	wailsruntime.WindowMinimise(a.ctx)
	return nil
}

func (a *App) WindowToggleMaximise() (WindowState, error) {
	if a.ctx == nil {
		return WindowState{}, fmt.Errorf("application context is not ready")
	}
	wailsruntime.WindowToggleMaximise(a.ctx)
	return a.GetWindowState(), nil
}

func (a *App) WindowClose() error {
	if a.ctx == nil {
		return fmt.Errorf("application context is not ready")
	}
	wailsruntime.Quit(a.ctx)
	return nil
}

func (a *App) GetSnapshot() (domain.Snapshot, error) {
	return a.service.GetSnapshot(), nil
}

func (a *App) GetLogRetentionSettings() (domain.LogRetentionSettings, error) {
	return a.service.GetLogRetentionSettings(), nil
}

func (a *App) SaveLogRetentionSettings(input domain.LogRetentionSettings) (domain.LogRetentionSettings, error) {
	return a.service.SaveLogRetentionSettings(input)
}

func (a *App) GetAppSettings() (domain.AppSettings, error) {
	return a.service.GetAppSettings(), nil
}

func (a *App) SaveAppSettings(input domain.AppSettings) (domain.AppSettings, error) {
	return a.service.SaveAppSettings(input)
}

func (a *App) CheckForUpdates() (domain.UpdateInfo, error) {
	checker := updatechecker.New(currentAppVersion)
	return checker.Check(context.Background())
}

func (a *App) StartManualUpgrade() (domain.UpdateInfo, error) {
	info, err := a.CheckForUpdates()
	if err != nil {
		return info, err
	}
	if a.ctx == nil {
		return info, fmt.Errorf("application context is not ready")
	}

	targetURL := info.DownloadURL
	if targetURL == "" {
		targetURL = info.ReleaseURL
	}
	if targetURL == "" {
		return info, fmt.Errorf("no update download url available")
	}

	wailsruntime.BrowserOpenURL(a.ctx, targetURL)
	return info, nil
}

func (a *App) GetUpdateState() (domain.UpdateState, error) {
	if a.dbStore == nil {
		return domain.UpdateState{}, nil
	}

	state, err := a.dbStore.LoadUpdateState()
	if err != nil {
		if errors.Is(err, storage.ErrSettingsStoreNotFound) {
			return domain.UpdateState{}, nil
		}
		return domain.UpdateState{}, err
	}

	if state.DownloadedPackage == nil {
		return state, nil
	}

	downloadedPath := strings.TrimSpace(state.DownloadedPackage.Path)
	if downloadedPath == "" {
		_ = a.dbStore.ClearUpdateState()
		return domain.UpdateState{}, nil
	}

	if _, err := os.Stat(downloadedPath); err != nil {
		if os.IsNotExist(err) {
			_ = a.dbStore.ClearUpdateState()
			return domain.UpdateState{}, nil
		}
		return domain.UpdateState{}, err
	}

	return state, nil
}

func (a *App) DownloadUpdatePackage() (domain.UpdateDownloadResult, error) {
	info, err := a.CheckForUpdates()
	if err != nil {
		return domain.UpdateDownloadResult{}, err
	}
	if !info.ReleaseFound {
		return domain.UpdateDownloadResult{}, fmt.Errorf("github release not found")
	}
	if !info.HasUpdate {
		return domain.UpdateDownloadResult{}, fmt.Errorf("current version is already the latest")
	}
	if !info.HasPlatformAsset || strings.TrimSpace(info.DownloadURL) == "" {
		return domain.UpdateDownloadResult{}, fmt.Errorf("no matching update package for platform %s", info.Platform)
	}
	if a.ctx == nil {
		return domain.UpdateDownloadResult{}, fmt.Errorf("application context is not ready")
	}

	defaultFilename := strings.TrimSpace(info.AssetName)
	if defaultFilename == "" {
		defaultFilename = fmt.Sprintf("NatsX-%s-%s.exe", info.LatestVersion, info.Platform)
	}

	savePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Save update package",
		DefaultFilename: defaultFilename,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Installer / Package", Pattern: extensionPattern(defaultFilename)},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return domain.UpdateDownloadResult{}, err
	}
	if strings.TrimSpace(savePath) == "" {
		return domain.UpdateDownloadResult{}, fmt.Errorf("download canceled")
	}

	a.emitUpdateDownloadProgress(domain.UpdateDownloadProgress{
		Status:          "downloading",
		LatestVersion:   info.LatestVersion,
		AssetName:       defaultFilename,
		Path:            savePath,
		DownloadedBytes: 0,
		TotalBytes:      0,
		ProgressPercent: 0,
	})

	written, err := updatechecker.Download(a.ctx, info.DownloadURL, savePath, func(downloaded int64, total int64) {
		a.emitUpdateDownloadProgress(domain.UpdateDownloadProgress{
			Status:          "downloading",
			LatestVersion:   info.LatestVersion,
			AssetName:       defaultFilename,
			Path:            savePath,
			DownloadedBytes: downloaded,
			TotalBytes:      total,
			ProgressPercent: calculateProgressPercent(downloaded, total),
		})
	})
	if err != nil {
		a.emitUpdateDownloadProgress(domain.UpdateDownloadProgress{
			Status:          "error",
			LatestVersion:   info.LatestVersion,
			AssetName:       defaultFilename,
			Path:            savePath,
			ErrorMessage:    err.Error(),
			DownloadedBytes: 0,
			TotalBytes:      0,
			ProgressPercent: 0,
		})
		return domain.UpdateDownloadResult{}, err
	}

	a.emitUpdateDownloadProgress(domain.UpdateDownloadProgress{
		Status:          "completed",
		LatestVersion:   info.LatestVersion,
		AssetName:       defaultFilename,
		Path:            savePath,
		DownloadedBytes: written,
		TotalBytes:      written,
		ProgressPercent: 100,
	})

	result := domain.UpdateDownloadResult{
		Path:          savePath,
		AssetName:     defaultFilename,
		LatestVersion: info.LatestVersion,
		ReleaseURL:    info.ReleaseURL,
		DownloadURL:   info.DownloadURL,
		Bytes:         written,
		DownloadedAt:  time.Now(),
	}
	if a.dbStore != nil {
		if err := a.dbStore.SaveUpdateState(domain.UpdateState{DownloadedPackage: &result}); err != nil {
			log.Printf("save update state failed: %v", err)
		}
	}

	return result, nil
}

func (a *App) OpenDownloadedUpdate(path string) error {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return fmt.Errorf("update package path is empty")
	}

	absolutePath, err := filepath.Abs(trimmed)
	if err != nil {
		return err
	}
	if _, err := os.Stat(absolutePath); err != nil {
		return err
	}

	if err := openPath(absolutePath); err != nil {
		return err
	}

	if a.ctx != nil {
		selection, err := wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
			Type:          wailsruntime.QuestionDialog,
			Title:         "Installer Started",
			Message:       "The update package has been opened. Quit NatsX now to continue the upgrade?",
			Buttons:       []string{"Later", "Quit Now"},
			DefaultButton: "Quit Now",
			CancelButton:  "Later",
		})
		if err == nil && selection == "Quit Now" {
			wailsruntime.Quit(a.ctx)
		}
	}

	return nil
}

func (a *App) RevealDownloadedUpdate(path string) error {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return fmt.Errorf("update package path is empty")
	}

	absolutePath, err := filepath.Abs(trimmed)
	if err != nil {
		return err
	}
	if _, err := os.Stat(absolutePath); err != nil {
		return err
	}

	return revealPath(absolutePath)
}

func (a *App) emitUpdateDownloadProgress(progress domain.UpdateDownloadProgress) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "natsx:update_download_progress", progress)
}

func calculateProgressPercent(downloaded int64, total int64) float64 {
	if total <= 0 {
		return 0
	}
	percent := (float64(downloaded) / float64(total)) * 100
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func extensionPattern(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return "*.*"
	}
	return "*" + ext
}

func openPath(target string) error {
	switch runtime.GOOS {
	case "windows":
		switch strings.ToLower(filepath.Ext(target)) {
		case ".exe":
			command := exec.Command(target)
			command.Dir = filepath.Dir(target)
			return command.Start()
		case ".msi":
			return exec.Command("msiexec", "/i", target).Start()
		default:
			return exec.Command("explorer.exe", target).Start()
		}
	case "darwin":
		return exec.Command("open", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}

func revealPath(target string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer.exe", "/select,", target).Start()
	case "darwin":
		return exec.Command("open", "-R", target).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(target)).Start()
	}
}

func (a *App) SaveConnection(input domain.ConnectionInput) (domain.ConnectionProfile, error) {
	return a.service.SaveConnection(input)
}

func (a *App) DeleteConnection(connectionID string) error {
	return a.service.DeleteConnection(connectionID)
}

func (a *App) ExportConnections(request domain.ExportConnectionsRequest) (domain.ExportConnectionsResponse, error) {
	return a.service.ExportConnections(request)
}

func (a *App) ExportConnectionsToFile(request domain.ExportConnectionsRequest) (domain.ExportConnectionsFileResponse, error) {
	response, err := a.service.ExportConnections(request)
	if err != nil {
		return domain.ExportConnectionsFileResponse{}, err
	}
	if a.ctx == nil {
		return domain.ExportConnectionsFileResponse{}, fmt.Errorf("application context is not ready")
	}

	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Export connections",
		DefaultFilename: defaultExportFilename(request.MaskSensitive),
		Filters: []wailsruntime.FileFilter{{
			DisplayName: "JSON Files (*.json)",
			Pattern:     "*.json",
		}},
	})
	if err != nil {
		return domain.ExportConnectionsFileResponse{}, err
	}
	if path == "" {
		return domain.ExportConnectionsFileResponse{}, fmt.Errorf("export canceled")
	}
	if err := os.WriteFile(path, []byte(response.Content), 0o600); err != nil {
		return domain.ExportConnectionsFileResponse{}, err
	}
	return domain.ExportConnectionsFileResponse{Path: path, Count: response.Count, Masked: response.Masked}, nil
}

func (a *App) ImportConnections(request domain.ImportConnectionsRequest) (domain.ImportConnectionsResponse, error) {
	return a.service.ImportConnections(request)
}

func (a *App) ImportConnectionsFromFile(request domain.ImportConnectionsFromFileRequest) (domain.ImportConnectionsResponse, error) {
	if a.ctx == nil {
		return domain.ImportConnectionsResponse{}, fmt.Errorf("application context is not ready")
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Import connections",
		Filters: []wailsruntime.FileFilter{{
			DisplayName: "JSON Files (*.json)",
			Pattern:     "*.json",
		}},
	})
	if err != nil {
		return domain.ImportConnectionsResponse{}, err
	}
	if path == "" {
		return domain.ImportConnectionsResponse{}, fmt.Errorf("import canceled")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return domain.ImportConnectionsResponse{}, err
	}
	response, err := a.service.ImportConnections(domain.ImportConnectionsRequest{Content: string(content), Overwrite: request.Overwrite})
	if err != nil {
		return domain.ImportConnectionsResponse{}, err
	}
	response.SourcePath = path
	return response, nil
}

func (a *App) Connect(connectionID string) (domain.ConnectionProfile, error) {
	return a.service.Connect(connectionID)
}

func (a *App) Disconnect(connectionID string) error {
	return a.service.Disconnect(connectionID)
}

func (a *App) Publish(request domain.PublishRequest) error {
	return a.service.Publish(request)
}

func (a *App) RepublishMessage(request domain.RepublishMessageRequest) (domain.RepublishMessageResponse, error) {
	return a.service.RepublishMessage(request)
}

func (a *App) Request(request domain.RequestMessageRequest) (domain.RequestMessageResponse, error) {
	return a.service.Request(request)
}

func (a *App) Reply(request domain.ReplyRequest) error {
	return a.service.Reply(request)
}

func (a *App) AckMessage(request domain.MessageActionRequest) error {
	return a.service.AckMessage(request)
}

func (a *App) NakMessage(request domain.MessageActionRequest) error {
	return a.service.NakMessage(request)
}

func (a *App) TermMessage(request domain.MessageActionRequest) error {
	return a.service.TermMessage(request)
}

func (a *App) UpsertStream(request domain.StreamUpsertRequest) (domain.StreamInfo, error) {
	return a.service.UpsertStream(request)
}

func (a *App) DeleteStream(request domain.StreamDeleteRequest) error {
	return a.service.DeleteStream(request)
}

func (a *App) UpsertConsumer(request domain.ConsumerUpsertRequest) (domain.ConsumerInfo, error) {
	return a.service.UpsertConsumer(request)
}

func (a *App) DeleteConsumer(request domain.ConsumerDeleteRequest) error {
	return a.service.DeleteConsumer(request)
}

func (a *App) FetchConsumerMessages(request domain.ConsumerFetchRequest) (domain.ConsumerFetchResponse, error) {
	return a.service.FetchConsumerMessages(request)
}

func (a *App) Subscribe(request domain.SubscribeRequest) (domain.SubscriptionInfo, error) {
	return a.service.Subscribe(request)
}

func (a *App) UpdateSubscription(request domain.UpdateSubscriptionRequest) (domain.SubscriptionInfo, error) {
	return a.service.UpdateSubscription(request)
}

func (a *App) SetSubscriptionState(request domain.SetSubscriptionStateRequest) (domain.SubscriptionInfo, error) {
	return a.service.SetSubscriptionState(request)
}

func (a *App) Unsubscribe(subscriptionID string) error {
	return a.service.Unsubscribe(subscriptionID)
}

func (a *App) ListStreams(connectionID string) ([]domain.StreamInfo, error) {
	return a.service.ListStreams(connectionID)
}

func (a *App) ListConsumers(connectionID string, streamName string) ([]domain.ConsumerInfo, error) {
	return a.service.ListConsumers(connectionID, streamName)
}

func defaultExportFilename(masked bool) string {
	timestamp := time.Now().Format("20060102-150405")
	name := "natsx-connections"
	if masked {
		name += "-masked"
	}
	return fmt.Sprintf("%s-%s.json", name, timestamp)
}

