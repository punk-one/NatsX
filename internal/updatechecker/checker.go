package updatechecker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"

	"natsx/internal/domain"
)

const (
	releasesAPI    = "https://api.github.com/repos/punk-one/NatsX/releases"
	repositoryURL  = "https://github.com/punk-one/NatsX"
	requestTimeout = 10 * time.Second
	manifestAsset  = "latest.json"
)

type Checker struct {
	currentVersion string
	client         *http.Client
}

type githubRelease struct {
	Draft       bool                 `json:"draft"`
	Prerelease  bool                 `json:"prerelease"`
	TagName     string               `json:"tag_name"`
	HTMLURL     string               `json:"html_url"`
	Body        string               `json:"body"`
	PublishedAt time.Time            `json:"published_at"`
	Assets      []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	APIURL             string `json:"url"`
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	ContentType        string `json:"content_type"`
	Size               int64  `json:"size"`
}

type releaseManifest struct {
	SchemaVersion int                    `json:"schemaVersion"`
	Product       string                 `json:"product"`
	Version       string                 `json:"version"`
	Tag           string                 `json:"tag"`
	ReleaseURL    string                 `json:"releaseUrl"`
	PublishedAt   time.Time              `json:"publishedAt"`
	ReleaseNotes  string                 `json:"releaseNotes"`
	Assets        []releaseManifestAsset `json:"assets"`
}

type releaseManifestAsset struct {
	Platform    string `json:"platform"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	DownloadURL string `json:"downloadUrl"`
	SHA256      string `json:"sha256"`
	Size        int64  `json:"size"`
}

func New(currentVersion string) *Checker {
	return &Checker{
		currentVersion: strings.TrimSpace(currentVersion),
		client: &http.Client{
			Timeout: requestTimeout,
		},
	}
}

func (c *Checker) Check(ctx context.Context) (domain.UpdateInfo, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	info := domain.UpdateInfo{
		CurrentVersion: normalizeVersion(c.currentVersion),
		Platform:       currentPlatform(),
		ReleaseURL:     repositoryURL + "/releases",
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, releasesAPI, nil)
	if err != nil {
		return info, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "NatsX-UpdateChecker")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := c.client.Do(request)
	if err != nil {
		return info, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return info, fmt.Errorf("github releases api returned %s", response.Status)
	}

	var releases []githubRelease
	if err := json.NewDecoder(response.Body).Decode(&releases); err != nil {
		return info, err
	}

	release, ok := pickLatestPublishedRelease(releases)
	if !ok {
		info.LatestVersion = info.CurrentVersion
		return info, nil
	}

	info.ReleaseFound = true
	info.LatestVersion = normalizeVersion(release.TagName)
	info.ReleaseURL = firstNonEmpty(release.HTMLURL, info.ReleaseURL)
	info.PublishedAt = release.PublishedAt
	info.ReleaseNotes = strings.TrimSpace(release.Body)

	if manifest, ok := c.loadReleaseManifest(ctx, release); ok {
		applyReleaseManifest(&info, manifest)
	}

	if !info.HasPlatformAsset {
		asset := pickBestAsset(release.Assets, info.Platform)
		if asset != nil {
			info.HasPlatformAsset = true
			info.AssetName = asset.Name
			info.DownloadURL = asset.BrowserDownloadURL
			info.AssetSize = asset.Size
		}
	}
	c.enrichSelectedAsset(ctx, release, &info)

	info.HasUpdate = compareVersions(info.LatestVersion, info.CurrentVersion) > 0
	return info, nil
}

func (c *Checker) loadReleaseManifest(ctx context.Context, release githubRelease) (releaseManifest, bool) {
	asset := pickReleaseManifestAsset(release.Assets)
	if asset == nil {
		return releaseManifest{}, false
	}

	candidates := []struct {
		url    string
		accept string
	}{
		{url: strings.TrimSpace(asset.APIURL), accept: "application/octet-stream"},
		{url: strings.TrimSpace(asset.BrowserDownloadURL), accept: "application/json"},
	}

	for _, candidate := range candidates {
		if candidate.url == "" {
			continue
		}
		manifest, ok := c.fetchReleaseManifest(ctx, candidate.url, candidate.accept, release.TagName)
		if ok {
			return manifest, true
		}
	}

	return releaseManifest{}, false
}

func (c *Checker) fetchReleaseManifest(ctx context.Context, sourceURL string, accept string, releaseTag string) (releaseManifest, bool) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return releaseManifest{}, false
	}
	if strings.TrimSpace(accept) != "" {
		request.Header.Set("Accept", accept)
	}
	request.Header.Set("User-Agent", "NatsX-UpdateChecker")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := c.client.Do(request)
	if err != nil {
		return releaseManifest{}, false
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return releaseManifest{}, false
	}

	var manifest releaseManifest
	if err := json.NewDecoder(response.Body).Decode(&manifest); err != nil {
		return releaseManifest{}, false
	}

	manifestVersion := normalizeVersion(firstNonEmpty(manifest.Version, manifest.Tag))
	releaseVersion := normalizeVersion(releaseTag)
	if manifestVersion != "" && releaseVersion != "" && manifestVersion != releaseVersion {
		return releaseManifest{}, false
	}

	return manifest, true
}

func pickReleaseManifestAsset(assets []githubReleaseAsset) *githubReleaseAsset {
	for index := range assets {
		asset := &assets[index]
		if strings.EqualFold(strings.TrimSpace(asset.Name), manifestAsset) {
			return asset
		}
	}
	return nil
}

func applyReleaseManifest(info *domain.UpdateInfo, manifest releaseManifest) {
	if info == nil {
		return
	}

	if version := normalizeVersion(firstNonEmpty(manifest.Version, manifest.Tag)); version != "" {
		info.LatestVersion = version
	}
	if releaseURL := strings.TrimSpace(manifest.ReleaseURL); releaseURL != "" {
		info.ReleaseURL = releaseURL
	}
	if !manifest.PublishedAt.IsZero() {
		info.PublishedAt = manifest.PublishedAt
	}
	if notes := strings.TrimSpace(manifest.ReleaseNotes); notes != "" {
		info.ReleaseNotes = notes
	}

	asset := pickBestManifestAsset(manifest.Assets, info.Platform)
	if asset == nil {
		return
	}

	info.HasPlatformAsset = true
	info.AssetName = strings.TrimSpace(asset.Name)
	info.DownloadURL = strings.TrimSpace(asset.DownloadURL)
	info.AssetSHA256 = normalizeSHA256Digest(asset.SHA256)
	info.AssetSize = asset.Size
}

func (c *Checker) enrichSelectedAsset(ctx context.Context, release githubRelease, info *domain.UpdateInfo) {
	if info == nil || !info.HasPlatformAsset {
		return
	}

	if info.AssetSize <= 0 {
		if asset := findReleaseAssetByName(release.Assets, info.AssetName); asset != nil {
			info.AssetSize = asset.Size
		}
	}

	if info.AssetSHA256 != "" {
		return
	}

	checksum, ok := c.loadAssetSHA256(ctx, release.Assets, info.AssetName)
	if ok {
		info.AssetSHA256 = checksum
	}
}

func findReleaseAssetByName(assets []githubReleaseAsset, assetName string) *githubReleaseAsset {
	needle := strings.ToLower(strings.TrimSpace(assetName))
	if needle == "" {
		return nil
	}

	for index := range assets {
		asset := &assets[index]
		if strings.EqualFold(strings.TrimSpace(asset.Name), needle) {
			return asset
		}
	}

	return nil
}

func (c *Checker) loadAssetSHA256(ctx context.Context, assets []githubReleaseAsset, assetName string) (string, bool) {
	for _, candidateName := range checksumLookupCandidates(assetName) {
		if checksumAsset := findReleaseAssetByName(assets, candidateName); checksumAsset != nil {
			if digest, ok := c.fetchReleaseChecksum(ctx, *checksumAsset, assetName); ok {
				return digest, true
			}
		}
	}

	if combinedAsset := findReleaseAssetByName(assets, combinedChecksumAsset); combinedAsset != nil {
		if digest, ok := c.fetchReleaseChecksum(ctx, *combinedAsset, assetName); ok {
			return digest, true
		}
	}

	return "", false
}

func (c *Checker) fetchReleaseChecksum(ctx context.Context, asset githubReleaseAsset, assetName string) (string, bool) {
	candidates := []struct {
		url    string
		accept string
	}{
		{url: strings.TrimSpace(asset.APIURL), accept: "application/octet-stream"},
		{url: strings.TrimSpace(asset.BrowserDownloadURL), accept: "text/plain"},
	}

	for _, candidate := range candidates {
		if candidate.url == "" {
			continue
		}

		content, ok := c.fetchReleaseTextAsset(ctx, candidate.url, candidate.accept)
		if !ok {
			continue
		}

		if digest := parseSHA256Digest(content, assetName); digest != "" {
			return digest, true
		}
	}

	return "", false
}

func (c *Checker) fetchReleaseTextAsset(ctx context.Context, sourceURL string, accept string) (string, bool) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return "", false
	}
	if strings.TrimSpace(accept) != "" {
		request.Header.Set("Accept", accept)
	}
	request.Header.Set("User-Agent", "NatsX-UpdateChecker")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := c.client.Do(request)
	if err != nil {
		return "", false
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", false
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return "", false
	}

	return string(body), true
}

func pickBestManifestAsset(assets []releaseManifestAsset, platform string) *releaseManifestAsset {
	if len(assets) == 0 {
		return nil
	}

	platformNeedle := strings.ToLower(strings.TrimSpace(platform))
	var exactInstaller *releaseManifestAsset
	var exactArchive *releaseManifestAsset
	var fallback *releaseManifestAsset

	for index := range assets {
		asset := &assets[index]
		if strings.ToLower(strings.TrimSpace(asset.Platform)) != platformNeedle {
			continue
		}

		kind := strings.ToLower(strings.TrimSpace(asset.Kind))
		switch kind {
		case "installer":
			if exactInstaller == nil {
				exactInstaller = asset
			}
		case "archive":
			if exactArchive == nil {
				exactArchive = asset
			}
		default:
			if fallback == nil {
				fallback = asset
			}
		}
	}

	switch {
	case exactInstaller != nil:
		return exactInstaller
	case exactArchive != nil:
		return exactArchive
	default:
		return fallback
	}
}

func pickLatestPublishedRelease(releases []githubRelease) (githubRelease, bool) {
	for _, release := range releases {
		if release.Draft || release.Prerelease {
			continue
		}
		return release, true
	}
	return githubRelease{}, false
}

func pickBestAsset(assets []githubReleaseAsset, platform string) *githubReleaseAsset {
	if len(assets) == 0 {
		return nil
	}

	platformNeedle := strings.ToLower(platform)
	var exactInstaller *githubReleaseAsset
	var exactArchive *githubReleaseAsset
	var fallback *githubReleaseAsset

	for index := range assets {
		asset := &assets[index]
		name := strings.ToLower(strings.TrimSpace(asset.Name))
		if !strings.Contains(name, platformNeedle) {
			continue
		}
		if strings.HasSuffix(name, "-setup.exe") || strings.HasSuffix(name, ".msi") || strings.HasSuffix(name, ".exe") {
			if exactInstaller == nil {
				exactInstaller = asset
			}
			continue
		}
		if strings.HasSuffix(name, ".zip") {
			if exactArchive == nil {
				exactArchive = asset
			}
			continue
		}
		if fallback == nil {
			fallback = asset
		}
	}

	switch {
	case exactInstaller != nil:
		return exactInstaller
	case exactArchive != nil:
		return exactArchive
	default:
		return fallback
	}
}

func currentPlatform() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}

func normalizeVersion(version string) string {
	trimmed := strings.TrimSpace(version)
	trimmed = strings.TrimPrefix(trimmed, "v")
	trimmed = strings.TrimPrefix(trimmed, "V")
	return trimmed
}

func compareVersions(left, right string) int {
	leftParts := parseVersion(normalizeVersion(left))
	rightParts := parseVersion(normalizeVersion(right))
	maxLen := len(leftParts)
	if len(rightParts) > maxLen {
		maxLen = len(rightParts)
	}

	for index := 0; index < maxLen; index++ {
		leftValue := 0
		if index < len(leftParts) {
			leftValue = leftParts[index]
		}
		rightValue := 0
		if index < len(rightParts) {
			rightValue = rightParts[index]
		}
		switch {
		case leftValue > rightValue:
			return 1
		case leftValue < rightValue:
			return -1
		}
	}

	return 0
}

func parseVersion(version string) []int {
	if version == "" {
		return []int{0}
	}

	segments := strings.Split(version, ".")
	parts := make([]int, 0, len(segments))
	for _, segment := range segments {
		digits := takeLeadingDigits(segment)
		if digits == "" {
			parts = append(parts, 0)
			continue
		}
		value, err := strconv.Atoi(digits)
		if err != nil {
			parts = append(parts, 0)
			continue
		}
		parts = append(parts, value)
	}
	return parts
}

func takeLeadingDigits(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if r < '0' || r > '9' {
			break
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
