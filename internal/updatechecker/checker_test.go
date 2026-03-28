package updatechecker

import "testing"

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
		{Platform: "windows-amd64", Name: "NatsX-1.0.2-windows-amd64.zip", Kind: "archive", DownloadURL: "zip"},
		{Platform: "windows-amd64", Name: "NatsX-1.0.2-windows-amd64-setup.exe", Kind: "installer", DownloadURL: "setup"},
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
