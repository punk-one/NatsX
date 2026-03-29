package updatechecker

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVerifySHA256(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "sample.bin")
	if err := os.WriteFile(path, []byte("hello natsx"), 0o644); err != nil {
		t.Fatalf("write sample file failed: %v", err)
	}

	actual, err := VerifySHA256(path, "e227f98f095474a82644f30dfb93b2a4ae4a9519b0fc6ce996b49af32bf15eb5")
	if err != nil {
		t.Fatalf("verify sha256 failed: %v", err)
	}
	if actual != "e227f98f095474a82644f30dfb93b2a4ae4a9519b0fc6ce996b49af32bf15eb5" {
		t.Fatalf("unexpected actual sha256: %q", actual)
	}
}

func TestVerifySHA256DetectsMismatch(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "sample.bin")
	if err := os.WriteFile(path, []byte("hello natsx"), 0o644); err != nil {
		t.Fatalf("write sample file failed: %v", err)
	}

	actual, err := VerifySHA256(path, strings.Repeat("0", 64))
	if err == nil {
		t.Fatal("expected sha256 mismatch")
	}
	if actual == "" {
		t.Fatal("expected actual digest on mismatch")
	}
}
