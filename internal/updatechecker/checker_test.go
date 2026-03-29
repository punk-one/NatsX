package updatechecker

import (
	"testing"

	"natsx/internal/domain"
)

func TestCompareVersions(t *testing.T) {
	testCases := []struct {
		left     string
		right    string
		expected int
	}{
		{left: "1.0.2", right: "1.0.1", expected: 1},
		{left: "1.0.1", right: "1.0.1", expected: 0},
		{left: "v1.0.1", right: "1.0.2", expected: -1},
		{left: "1.10.0", right: "1.9.9", expected: 1},
		{left: "1.0.1-beta", right: "1.0.1", expected: 0},
	}

	for _, testCase := range testCases {
		actual := compareVersions(testCase.left, testCase.right)
		if actual != testCase.expected {
			t.Fatalf("compareVersions(%q, %q) = %d, want %d", testCase.left, testCase.right, actual, testCase.expected)
		}
	}
}

func TestPickBestAsset(t *testing.T) {
	assets := []githubReleaseAsset{
		{Name: "NatsX-1.0.2-linux-amd64.tar.gz", BrowserDownloadURL: "linux"},
		{Name: "NatsX-1.0.2-windows-amd64.zip", BrowserDownloadURL: "zip"},
		{Name: "NatsX-1.0.2-windows-amd64-setup.exe", BrowserDownloadURL: "setup"},
	}

	selected := pickBestAsset(assets, "windows-amd64")
	if selected == nil {
		t.Fatal("expected matching asset")
	}
	if selected.BrowserDownloadURL != "setup" {
		t.Fatalf("expected setup asset, got %q", selected.BrowserDownloadURL)
	}
}

func TestPickLatestPublishedRelease(t *testing.T) {
	releases := []githubRelease{
		{TagName: "v1.0.3", Draft: true},
		{TagName: "v1.0.2", Prerelease: true},
		{TagName: "v1.0.1"},
	}

	selected, ok := pickLatestPublishedRelease(releases)
	if !ok {
		t.Fatal("expected published release")
	}
	if selected.TagName != "v1.0.1" {
		t.Fatalf("expected v1.0.1, got %q", selected.TagName)
	}
}

func TestPickReleaseManifestAsset(t *testing.T) {
	assets := []githubReleaseAsset{
		{Name: "NatsX-1.0.2-windows-amd64.zip"},
		{Name: "latest.json", BrowserDownloadURL: "manifest"},
	}

	selected := pickReleaseManifestAsset(assets)
	if selected == nil {
		t.Fatal("expected manifest asset")
	}
	if selected.BrowserDownloadURL != "manifest" {
		t.Fatalf("expected manifest url, got %q", selected.BrowserDownloadURL)
	}
}

func TestPickBestManifestAsset(t *testing.T) {
	assets := []releaseManifestAsset{
		{Platform: "windows-amd64", Name: "NatsX-1.0.2-windows-amd64.zip", Kind: "archive", DownloadURL: "zip", SHA256: "zipsha", Size: 1024},
		{Platform: "windows-amd64", Name: "NatsX-1.0.2-windows-amd64-setup.exe", Kind: "installer", DownloadURL: "setup", SHA256: "setupsha", Size: 2048},
		{Platform: "linux-amd64", Name: "NatsX-1.0.2-linux-amd64.tar.gz", Kind: "archive", DownloadURL: "linux"},
	}

	selected := pickBestManifestAsset(assets, "windows-amd64")
	if selected == nil {
		t.Fatal("expected manifest asset")
	}
	if selected.DownloadURL != "setup" {
		t.Fatalf("expected installer manifest asset, got %q", selected.DownloadURL)
	}
}

func TestApplyReleaseManifestCopiesChecksumMetadata(t *testing.T) {
	info := &domain.UpdateInfo{Platform: "windows-amd64"}
	manifest := releaseManifest{
		Version: "1.0.3",
		Assets: []releaseManifestAsset{
			{
				Platform:    "windows-amd64",
				Name:        "NatsX-1.0.3-windows-amd64.zip",
				Kind:        "archive",
				DownloadURL: "https://example.com/NatsX-1.0.3-windows-amd64.zip",
				SHA256:      "1B83B14CC34E3F701F64774CCFE44FEEE200C2F4356ABF2285650DF8704992B9",
				Size:        7131033,
			},
		},
	}

	applyReleaseManifest(info, manifest)

	if info.AssetSHA256 != "1b83b14cc34e3f701f64774ccfe44feee200c2f4356abf2285650df8704992b9" {
		t.Fatalf("unexpected asset sha256: %q", info.AssetSHA256)
	}
	if info.AssetSize != 7131033 {
		t.Fatalf("unexpected asset size: %d", info.AssetSize)
	}
}
