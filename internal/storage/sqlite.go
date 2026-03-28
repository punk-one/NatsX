package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"natsx/internal/domain"

	_ "modernc.org/sqlite"
)

const (
	defaultLogMaxEntries = 1000
	defaultLogMaxBytes   = int64(100 * 1024 * 1024)
	appSettingsKey       = "app_settings"
	updateStateKey       = "update_state"
	databaseFileName     = "natsx.db"
	legacyDatabaseName   = "nats.db"
)

type SQLiteStore struct {
	db   *sql.DB
	path string
}

func NewSQLiteStore() (*SQLiteStore, error) {
	path, err := resolveDatabasePath()
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	store := &SQLiteStore{
		db:   db,
		path: path,
	}

	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *SQLiteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *SQLiteStore) Path() string {
	return s.path
}

func (s *SQLiteStore) Load() ([]domain.ConnectionProfile, error) {
	rows, err := s.db.Query(`SELECT payload_json FROM connections ORDER BY updated_at DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	profiles := make([]domain.ConnectionProfile, 0)
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}

		var profile domain.ConnectionProfile
		if err := json.Unmarshal([]byte(payload), &profile); err != nil {
			return nil, err
		}
		profile.Connected = false
		profiles = append(profiles, profile)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(profiles) == 0 {
		return nil, ErrStoreNotFound
	}

	return profiles, nil
}

func (s *SQLiteStore) Save(profiles []domain.ConnectionProfile) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer rollbackOnError(tx)

	if _, err := tx.Exec(`DELETE FROM connections`); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO connections (id, updated_at, payload_json) VALUES (?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, profile := range profiles {
		payload, err := json.Marshal(profile)
		if err != nil {
			return err
		}

		updatedAt := profile.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = time.Now()
		}

		if _, err := stmt.Exec(profile.ID, updatedAt.Format(time.RFC3339Nano), string(payload)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *SQLiteStore) LoadAppSettings() (domain.AppSettings, error) {
	var payload string
	err := s.db.QueryRow(`SELECT value_json FROM settings WHERE key = ?`, appSettingsKey).Scan(&payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.AppSettings{}, ErrSettingsStoreNotFound
		}
		return domain.AppSettings{}, err
	}

	var settings domain.AppSettings
	if err := json.Unmarshal([]byte(payload), &settings); err != nil {
		return domain.AppSettings{}, err
	}

	return settings, nil
}

func (s *SQLiteStore) SaveAppSettings(settings domain.AppSettings) error {
	payload, err := json.Marshal(settings)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
		appSettingsKey,
		string(payload),
		time.Now().Format(time.RFC3339Nano),
	)
	return err
}

func (s *SQLiteStore) LoadUpdateState() (domain.UpdateState, error) {
	var payload string
	err := s.db.QueryRow(`SELECT value_json FROM settings WHERE key = ?`, updateStateKey).Scan(&payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.UpdateState{}, ErrSettingsStoreNotFound
		}
		return domain.UpdateState{}, err
	}

	var state domain.UpdateState
	if err := json.Unmarshal([]byte(payload), &state); err != nil {
		return domain.UpdateState{}, err
	}

	return state, nil
}

func (s *SQLiteStore) SaveUpdateState(state domain.UpdateState) error {
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
		updateStateKey,
		string(payload),
		time.Now().Format(time.RFC3339Nano),
	)
	return err
}

func (s *SQLiteStore) ClearUpdateState() error {
	_, err := s.db.Exec(`DELETE FROM settings WHERE key = ?`, updateStateKey)
	return err
}

func (s *SQLiteStore) LoadMessages() ([]domain.MessageRecord, error) {
	rows, err := s.db.Query(`SELECT payload_json FROM messages ORDER BY seq DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]domain.MessageRecord, 0)
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}

		var record domain.MessageRecord
		if err := json.Unmarshal([]byte(payload), &record); err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

func (s *SQLiteStore) UpsertMessage(record domain.MessageRecord) error {
	payload, err := json.Marshal(record)
	if err != nil {
		return err
	}

	receivedAt := record.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = time.Now()
	}

	_, err = s.db.Exec(
		`INSERT INTO messages (id, connection_id, received_at, size_bytes, payload_json) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   connection_id = excluded.connection_id,
		   received_at = excluded.received_at,
		   size_bytes = excluded.size_bytes,
		   payload_json = excluded.payload_json`,
		record.ID,
		record.ConnectionID,
		receivedAt.Format(time.RFC3339Nano),
		estimateMessageBytes(record),
		string(payload),
	)
	return err
}

func (s *SQLiteStore) DeleteMessagesByConnection(connectionID string) error {
	if strings.TrimSpace(connectionID) == "" {
		return nil
	}

	_, err := s.db.Exec(`DELETE FROM messages WHERE connection_id = ?`, strings.TrimSpace(connectionID))
	return err
}

func (s *SQLiteStore) ApplyLogRetention(input domain.LogRetentionSettings) error {
	settings := normalizeLogRetentionSettings(input)

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer rollbackOnError(tx)

	if _, err := tx.Exec(
		`DELETE FROM messages
		  WHERE seq IN (
		    SELECT seq FROM messages ORDER BY seq DESC LIMIT -1 OFFSET ?
		  )`,
		settings.MaxEntries,
	); err != nil {
		return err
	}

	rows, err := tx.Query(`SELECT seq, size_bytes FROM messages ORDER BY seq DESC`)
	if err != nil {
		return err
	}

	type retainedMessage struct {
		seq  int64
		size int64
	}

	retained := make([]retainedMessage, 0)
	var totalBytes int64
	for rows.Next() {
		var item retainedMessage
		if err := rows.Scan(&item.seq, &item.size); err != nil {
			rows.Close()
			return err
		}
		totalBytes += item.size
		if totalBytes > settings.MaxTotalBytes {
			retained = append(retained, item)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if len(retained) > 0 {
		placeholders := make([]string, 0, len(retained))
		args := make([]interface{}, 0, len(retained))
		for _, item := range retained {
			placeholders = append(placeholders, "?")
			args = append(args, item.seq)
		}

		query := fmt.Sprintf(`DELETE FROM messages WHERE seq IN (%s)`, strings.Join(placeholders, ","))
		if _, err := tx.Exec(query, args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *SQLiteStore) init() error {
	pragmas := []string{
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA journal_mode = DELETE`,
		`PRAGMA foreign_keys = ON`,
	}

	for _, statement := range pragmas {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}

	schema := []string{
		`CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			updated_at TEXT NOT NULL,
			payload_json TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			id TEXT NOT NULL UNIQUE,
			connection_id TEXT NOT NULL,
			received_at TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			payload_json TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_updated_at ON connections(updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_connection_id ON messages(connection_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at DESC, seq DESC)`,
	}

	for _, statement := range schema {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}

	return s.db.Ping()
}

func (s *SQLiteStore) countRows(table string) (int, error) {
	var count int
	row := s.db.QueryRow(fmt.Sprintf(`SELECT COUNT(1) FROM %s`, table))
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *SQLiteStore) countSettings() (int, error) {
	var count int
	row := s.db.QueryRow(`SELECT COUNT(1) FROM settings WHERE key = ?`, appSettingsKey)
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func resolveDatabasePath() (string, error) {
	executablePath, err := os.Executable()
	cwd, cwdErr := os.Getwd()
	if err != nil && cwdErr != nil {
		return "", err
	}

	executableDir := ""
	if err == nil && strings.TrimSpace(executablePath) != "" {
		executableDir = filepath.Dir(executablePath)
	}

	candidates := make([]string, 0, 2)
	if executableDir != "" {
		candidates = append(candidates, executableDir)
	}
	if cwdErr == nil && strings.TrimSpace(cwd) != "" {
		candidates = append(candidates, cwd)
	}

	for _, baseDir := range uniqueStrings(candidates) {
		if path, ok := existingDatabasePath(baseDir); ok {
			return path, nil
		}
	}

	baseDir := executableDir
	if baseDir == "" || looksLikeTemporaryDir(baseDir) {
		baseDir = cwd
	}
	if strings.TrimSpace(baseDir) == "" {
		return "", fmt.Errorf("unable to resolve database directory")
	}

	databaseDir := filepath.Join(baseDir, "database")
	if err := os.MkdirAll(databaseDir, 0o755); err != nil {
		return "", err
	}

	legacyPath := filepath.Join(databaseDir, legacyDatabaseName)
	databasePath := filepath.Join(databaseDir, databaseFileName)
	if fileExists(legacyPath) && !fileExists(databasePath) {
		if err := os.Rename(legacyPath, databasePath); err != nil {
			return "", err
		}
	}

	file, err := os.OpenFile(databasePath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}

	return databasePath, nil
}

func existingDatabasePath(baseDir string) (string, bool) {
	if strings.TrimSpace(baseDir) == "" {
		return "", false
	}

	databaseDir := filepath.Join(baseDir, "database")
	namedPath := filepath.Join(databaseDir, databaseFileName)
	if fileExists(namedPath) {
		return namedPath, true
	}

	legacyPath := filepath.Join(databaseDir, legacyDatabaseName)
	if fileExists(legacyPath) {
		if err := os.Rename(legacyPath, namedPath); err == nil {
			return namedPath, true
		}
		return legacyPath, true
	}

	return "", false
}

func looksLikeTemporaryDir(path string) bool {
	normalized := strings.ToLower(filepath.Clean(path))
	tempDir := strings.ToLower(filepath.Clean(os.TempDir()))
	if strings.HasPrefix(normalized, tempDir) {
		return true
	}

	return strings.Contains(normalized, "go-build") || strings.Contains(normalized, "wails") || strings.Contains(normalized, "\\temp\\")
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
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

func rollbackOnError(tx *sql.Tx) {
	if tx != nil {
		_ = tx.Rollback()
	}
}
