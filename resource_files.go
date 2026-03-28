package main

import (
	"bytes"
	"crypto/md5"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"natsx/internal/domain"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	resourcesDirName      = "resources"
	credentialsSubdirName = "credentials"
	tlsCertsSubdirName    = "tls\\certs"
	tlsKeysSubdirName     = "tls\\keys"
	tlsCAsSubdirName      = "tls\\ca"
)

var (
	credentialsExtensions = []string{".creds"}
	certificateExtensions = []string{".pem", ".crt", ".cer"}
	keyExtensions         = []string{".pem", ".key"}
)

func (a *App) ImportCredentialsFile() (domain.ManagedResourceFile, error) {
	return a.importManagedResourceFile(
		credentialsSubdirName,
		"Select credentials file",
		[]wailsruntime.FileFilter{
			{DisplayName: "Credentials Files (*.creds)", Pattern: "*.creds"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	)
}

func (a *App) ListCredentialsFiles() ([]domain.ManagedResourceFile, error) {
	return listManagedResourceFiles(credentialsSubdirName, credentialsExtensions)
}

func (a *App) ImportTLSCertFile() (domain.ManagedResourceFile, error) {
	return a.importManagedResourceFile(
		tlsCertsSubdirName,
		"Select certificate file",
		[]wailsruntime.FileFilter{
			{DisplayName: "Certificate Files (*.pem;*.crt;*.cer)", Pattern: "*.pem;*.crt;*.cer"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	)
}

func (a *App) ListTLSCertFiles() ([]domain.ManagedResourceFile, error) {
	return listManagedResourceFiles(tlsCertsSubdirName, certificateExtensions)
}

func (a *App) ImportTLSKeyFile() (domain.ManagedResourceFile, error) {
	return a.importManagedResourceFile(
		tlsKeysSubdirName,
		"Select private key file",
		[]wailsruntime.FileFilter{
			{DisplayName: "Private Key Files (*.pem;*.key)", Pattern: "*.pem;*.key"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	)
}

func (a *App) ListTLSKeyFiles() ([]domain.ManagedResourceFile, error) {
	return listManagedResourceFiles(tlsKeysSubdirName, keyExtensions)
}

func (a *App) ImportTLSCAFile() (domain.ManagedResourceFile, error) {
	return a.importManagedResourceFile(
		tlsCAsSubdirName,
		"Select CA file",
		[]wailsruntime.FileFilter{
			{DisplayName: "CA Files (*.pem;*.crt;*.cer)", Pattern: "*.pem;*.crt;*.cer"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	)
}

func (a *App) ListTLSCAFiles() ([]domain.ManagedResourceFile, error) {
	return listManagedResourceFiles(tlsCAsSubdirName, certificateExtensions)
}

func (a *App) importManagedResourceFile(
	subdir string,
	title string,
	filters []wailsruntime.FileFilter,
) (domain.ManagedResourceFile, error) {
	if a.ctx == nil {
		return domain.ManagedResourceFile{}, fmt.Errorf("application context is not ready")
	}

	sourcePath, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:   title,
		Filters: filters,
	})
	if err != nil {
		return domain.ManagedResourceFile{}, err
	}
	if strings.TrimSpace(sourcePath) == "" {
		return domain.ManagedResourceFile{}, fmt.Errorf("resource import canceled")
	}

	targetDir, err := resolveManagedResourceDir(subdir)
	if err != nil {
		return domain.ManagedResourceFile{}, err
	}

	importedPath, reused, err := copyManagedFile(sourcePath, targetDir)
	if err != nil {
		return domain.ManagedResourceFile{}, err
	}

	file, err := buildManagedResourceFile(importedPath, targetDir)
	if err != nil {
		return domain.ManagedResourceFile{}, err
	}
	file.Reused = reused
	return file, nil
}

func listManagedResourceFiles(subdir string, allowedExtensions []string) ([]domain.ManagedResourceFile, error) {
	targetDir, err := resolveManagedResourceDir(subdir)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return nil, err
	}

	files := make([]domain.ManagedResourceFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !matchesAllowedExtension(name, allowedExtensions) {
			continue
		}

		item, err := buildManagedResourceFile(filepath.Join(targetDir, name), targetDir)
		if err != nil {
			return nil, err
		}
		files = append(files, item)
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].UpdatedAt.Equal(files[j].UpdatedAt) {
			return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
		}
		return files[i].UpdatedAt.After(files[j].UpdatedAt)
	})

	return files, nil
}

func matchesAllowedExtension(name string, allowedExtensions []string) bool {
	if len(allowedExtensions) == 0 {
		return true
	}

	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(name)))
	for _, candidate := range allowedExtensions {
		if ext == strings.ToLower(strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}

func resolveManagedResourceDir(subdir string) (string, error) {
	baseDir, err := resolveApplicationBaseDir()
	if err != nil {
		return "", err
	}

	resourceDir := filepath.Join(baseDir, resourcesDirName)
	if strings.TrimSpace(subdir) != "" {
		resourceDir = filepath.Join(resourceDir, filepath.FromSlash(strings.ReplaceAll(subdir, "\\", "/")))
	}

	if err := os.MkdirAll(resourceDir, 0o755); err != nil {
		return "", err
	}
	return resourceDir, nil
}

func resolveApplicationBaseDir() (string, error) {
	executablePath, exeErr := os.Executable()
	cwd, cwdErr := os.Getwd()
	if exeErr != nil && cwdErr != nil {
		return "", exeErr
	}

	executableDir := ""
	if exeErr == nil && strings.TrimSpace(executablePath) != "" {
		executableDir = filepath.Dir(executablePath)
	}

	baseDir := executableDir
	if baseDir == "" || looksLikeTemporaryDir(baseDir) {
		baseDir = cwd
	}
	if strings.TrimSpace(baseDir) == "" {
		return "", fmt.Errorf("unable to resolve application base directory")
	}

	return baseDir, nil
}

func looksLikeTemporaryDir(path string) bool {
	normalized := strings.ToLower(filepath.Clean(path))
	tempDir := strings.ToLower(filepath.Clean(os.TempDir()))
	if strings.HasPrefix(normalized, tempDir) {
		return true
	}

	return strings.Contains(normalized, "go-build") || strings.Contains(normalized, "wails") || strings.Contains(normalized, "\\temp\\")
}

func copyManagedFile(sourcePath string, targetDir string) (string, bool, error) {
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return "", false, err
	}
	if sourceInfo.IsDir() {
		return "", false, fmt.Errorf("selected path is a directory")
	}

	sourceContent, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", false, err
	}

	sourceChecksum := md5.Sum(sourceContent)
	existingPath, err := findManagedFileByChecksum(targetDir, sourceChecksum[:])
	if err != nil {
		return "", false, err
	}
	if existingPath != "" {
		return existingPath, true, nil
	}

	targetPath := uniqueManagedFilePath(targetDir, filepath.Base(sourcePath))
	if err := os.WriteFile(targetPath, sourceContent, 0o600); err != nil {
		return "", false, err
	}

	return targetPath, false, nil
}

func findManagedFileByChecksum(targetDir string, expectedChecksum []byte) (string, error) {
	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		candidatePath := filepath.Join(targetDir, entry.Name())
		content, err := os.ReadFile(candidatePath)
		if err != nil {
			return "", err
		}
		sum := md5.Sum(content)
		if bytes.Equal(sum[:], expectedChecksum) {
			return candidatePath, nil
		}
	}

	return "", nil
}

func uniqueManagedFilePath(targetDir string, filename string) string {
	sanitizedName := strings.TrimSpace(filename)
	if sanitizedName == "" {
		sanitizedName = fmt.Sprintf("resource-%d", time.Now().Unix())
	}

	ext := filepath.Ext(sanitizedName)
	nameOnly := strings.TrimSuffix(sanitizedName, ext)
	candidate := filepath.Join(targetDir, nameOnly+ext)
	if _, err := os.Stat(candidate); os.IsNotExist(err) {
		return candidate
	}

	for index := 1; ; index++ {
		candidate = filepath.Join(targetDir, fmt.Sprintf("%s-%d%s", nameOnly, index, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}

func buildManagedResourceFile(path string, parentDir string) (domain.ManagedResourceFile, error) {
	info, err := os.Stat(path)
	if err != nil {
		return domain.ManagedResourceFile{}, err
	}

	relativePath, err := filepath.Rel(parentDir, path)
	if err != nil {
		relativePath = filepath.Base(path)
	}

	return domain.ManagedResourceFile{
		Name:         filepath.Base(path),
		Path:         path,
		RelativePath: relativePath,
		Size:         info.Size(),
		UpdatedAt:    info.ModTime(),
	}, nil
}
