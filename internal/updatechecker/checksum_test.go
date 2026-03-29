package updatechecker

import "testing"

func TestParseSHA256DigestMatchesAssetName(t *testing.T) {
	content := "1b83b14cc34e3f701f64774ccfe44feee200c2f4356abf2285650df8704992b9 *NatsX-1.0.3-windows-amd64.zip\n"

	digest := parseSHA256Digest(content, "NatsX-1.0.3-windows-amd64.zip")
	if digest != "1b83b14cc34e3f701f64774ccfe44feee200c2f4356abf2285650df8704992b9" {
		t.Fatalf("unexpected digest: %q", digest)
	}
}

func TestParseSHA256DigestMatchesAbsolutePathEntry(t *testing.T) {
	content := "1b83b14cc34e3f701f64774ccfe44feee200c2f4356abf2285650df8704992b9  /mnt/d/Workspace/NatsX/release/NatsX-1.0.3-windows-amd64.zip\n"

	digest := parseSHA256Digest(content, "NatsX-1.0.3-windows-amd64.zip")
	if digest != "1b83b14cc34e3f701f64774ccfe44feee200c2f4356abf2285650df8704992b9" {
		t.Fatalf("unexpected digest: %q", digest)
	}
}

func TestChecksumLookupCandidatesStripsArchiveExtension(t *testing.T) {
	candidates := checksumLookupCandidates("NatsX-1.0.3-windows-amd64.zip")
	if len(candidates) != 2 {
		t.Fatalf("expected two checksum candidates, got %d (%v)", len(candidates), candidates)
	}
	if candidates[0] != "NatsX-1.0.3-windows-amd64.zip.sha256.txt" {
		t.Fatalf("unexpected first candidate: %q", candidates[0])
	}
	if candidates[1] != "NatsX-1.0.3-windows-amd64.sha256.txt" {
		t.Fatalf("unexpected second candidate: %q", candidates[1])
	}
}
