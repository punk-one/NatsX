package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"natsx/internal/domain"
)

type LegacyMigrationResult struct {
	ConnectionsMigrated bool
	SettingsMigrated    bool
	ConnectionSource    string
	SettingsSource      string
}

func (s *SQLiteStore) MigrateLegacyJSON(appName string) (LegacyMigrationResult, error) {
	if s == nil || s.db == nil {
		return LegacyMigrationResult{}, errors.New("sqlite store is not initialized")
	}

	legacyPaths, err := resolveLegacyPaths(appName)
	if err != nil {
		return LegacyMigrationResult{}, err
	}

	result := LegacyMigrationResult{
		ConnectionSource: legacyPaths.connectionsPath,
		SettingsSource:   legacyPaths.settingsPath,
	}

	connectionCount, err := s.countRows("connections")
	if err != nil {
		return result, err
	}
	if connectionCount == 0 {
		profiles, found, err := loadLegacyConnections(legacyPaths.connectionsPath)
		if err != nil {
			return result, err
		}
		if found && len(profiles) > 0 {
			if err := s.Save(profiles); err != nil {
				return result, err
			}
			result.ConnectionsMigrated = true
			archiveLegacyFile(legacyPaths.connectionsPath)
		}
	}

	settingsCount, err := s.countSettings()
	if err != nil {
		return result, err
	}
	if settingsCount == 0 {
		settings, found, err := loadLegacySettings(legacyPaths.settingsPath)
		if err != nil {
			return result, err
		}
		if found {
			if err := s.SaveAppSettings(settings); err != nil {
				return result, err
			}
			result.SettingsMigrated = true
			archiveLegacyFile(legacyPaths.settingsPath)
		}
	}

	return result, nil
}

type legacyPaths struct {
	connectionsPath string
	settingsPath    string
}

func resolveLegacyPaths(appName string) (legacyPaths, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return legacyPaths{}, err
	}

	baseDir := filepath.Join(configDir, appName)
	return legacyPaths{
		connectionsPath: filepath.Join(baseDir, "connections.json"),
		settingsPath:    filepath.Join(baseDir, "settings.json"),
	}, nil
}

func loadLegacyConnections(path string) ([]domain.ConnectionProfile, bool, error) {
	content, found, err := readLegacyFile(path)
	if err != nil || !found {
		return nil, found, err
	}
	if len(content) == 0 {
		return []domain.ConnectionProfile{}, true, nil
	}

	var profiles []domain.ConnectionProfile
	if err := json.Unmarshal(content, &profiles); err != nil {
		return nil, false, fmt.Errorf("load legacy connections failed: %w", err)
	}

	now := time.Now()
	for index := range profiles {
		profiles[index].Connected = false
		if profiles[index].UpdatedAt.IsZero() {
			profiles[index].UpdatedAt = now
		}
	}

	return profiles, true, nil
}

func loadLegacySettings(path string) (domain.AppSettings, bool, error) {
	content, found, err := readLegacyFile(path)
	if err != nil || !found {
		return domain.AppSettings{}, found, err
	}
	if len(content) == 0 {
		return domain.AppSettings{
			LogRetention: normalizeLogRetentionSettings(domain.LogRetentionSettings{}),
		}, true, nil
	}

	var payload struct {
		LogRetention domain.LogRetentionSettings `json:"logRetention"`
	}
	if err := json.Unmarshal(content, &payload); err != nil {
		return domain.AppSettings{}, false, fmt.Errorf("load legacy settings failed: %w", err)
	}

	return domain.AppSettings{
		AutoCheckUpdate:       true,
		AutoResubscribe:       true,
		MultiSubjectSubscribe: true,
		MaxReconnectTimes:     10,
		MaxPayloadSize:        512,
		ThemeMode:             "light",
		Language:              "zh-CN",
		LogRetention:          normalizeLogRetentionSettings(payload.LogRetention),
	}, true, nil
}

func readLegacyFile(path string) ([]byte, bool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return content, true, nil
}

func archiveLegacyFile(path string) {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return
	}

	archivedPath := path + ".migrated"
	if _, err := os.Stat(archivedPath); err == nil {
		archivedPath = fmt.Sprintf("%s.%s.migrated", path, time.Now().Format("20060102150405"))
	}

	_ = os.Rename(path, archivedPath)
}
