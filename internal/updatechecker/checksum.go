package updatechecker

import "strings"

const combinedChecksumAsset = "SHA256SUMS"

var checksumAssetExtensions = []string{
	".tar.gz",
	".tar.xz",
	".tar.bz2",
	".zip",
	".tgz",
	".exe",
	".msi",
	".dmg",
	".pkg",
	".deb",
	".rpm",
}

func normalizeSHA256Digest(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if len(trimmed) != 64 {
		return ""
	}
	for _, r := range trimmed {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return ""
		}
	}
	return trimmed
}

func parseSHA256Digest(content string, assetName string) string {
	targetName := baseAssetName(assetName)
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		digest := normalizeSHA256Digest(fields[0])
		if digest == "" {
			continue
		}
		if len(fields) == 1 {
			return digest
		}

		fileName := strings.TrimSpace(strings.Join(fields[1:], " "))
		fileName = strings.TrimPrefix(fileName, "*")
		fileName = strings.Trim(fileName, "\"")
		if targetName != "" && strings.EqualFold(baseAssetName(fileName), targetName) {
			return digest
		}
	}

	return ""
}

func checksumLookupCandidates(assetName string) []string {
	trimmed := strings.TrimSpace(assetName)
	if trimmed == "" {
		return nil
	}

	candidates := []string{trimmed + ".sha256.txt"}
	if stripped := stripAssetArchiveExtension(trimmed); stripped != "" && !strings.EqualFold(stripped, trimmed) {
		candidates = append(candidates, stripped+".sha256.txt")
	}

	seen := make(map[string]struct{}, len(candidates))
	unique := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		key := strings.ToLower(strings.TrimSpace(candidate))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, candidate)
	}

	return unique
}

func stripAssetArchiveExtension(name string) string {
	trimmed := strings.TrimSpace(name)
	lower := strings.ToLower(trimmed)
	for _, extension := range checksumAssetExtensions {
		if strings.HasSuffix(lower, extension) {
			return trimmed[:len(trimmed)-len(extension)]
		}
	}
	return trimmed
}

func baseAssetName(name string) string {
	trimmed := strings.TrimSpace(name)
	trimmed = strings.Trim(trimmed, "\"")
	trimmed = strings.ReplaceAll(trimmed, "\\", "/")
	if index := strings.LastIndex(trimmed, "/"); index >= 0 {
		trimmed = trimmed[index+1:]
	}
	return trimmed
}
