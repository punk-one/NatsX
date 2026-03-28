package updatechecker

import (
	"context"
	"encoding/json"
	"fmt"
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
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	ContentType        string `json:"content_type"`
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

	asset := pickBestAsset(release.Assets, info.Platform)
	if asset != nil {
		info.HasPlatformAsset = true
		info.AssetName = asset.Name
		info.DownloadURL = asset.BrowserDownloadURL
	}

	info.HasUpdate = compareVersions(info.LatestVersion, info.CurrentVersion) > 0
	return info, nil
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
