package updatechecker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const downloadTimeout = 30 * time.Minute

type ProgressFunc func(downloaded int64, total int64)

func Download(ctx context.Context, sourceURL string, destination string, progress ProgressFunc) (int64, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if sourceURL == "" {
		return 0, fmt.Errorf("download url is empty")
	}
	if destination == "" {
		return 0, fmt.Errorf("destination path is empty")
	}

	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return 0, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return 0, err
	}
	request.Header.Set("User-Agent", "NatsX-Updater")

	client := &http.Client{Timeout: downloadTimeout}
	response, err := client.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("download returned %s", response.Status)
	}
	if progress != nil {
		progress(0, response.ContentLength)
	}

	tempPath := destination + ".download"
	file, err := os.Create(tempPath)
	if err != nil {
		return 0, err
	}

	reader := io.Reader(response.Body)
	if progress != nil {
		reader = &progressReader{
			reader:   response.Body,
			total:    response.ContentLength,
			progress: progress,
		}
	}

	written, copyErr := io.Copy(file, reader)
	closeErr := file.Close()
	if copyErr != nil {
		_ = os.Remove(tempPath)
		return written, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tempPath)
		return written, closeErr
	}
	if err := os.Rename(tempPath, destination); err != nil {
		_ = os.Remove(tempPath)
		return written, err
	}

	return written, nil
}

type progressReader struct {
	reader       io.Reader
	total        int64
	progress     ProgressFunc
	downloaded   int64
	lastEmitted  int64
	lastEmitTime time.Time
}

func (p *progressReader) Read(buffer []byte) (int, error) {
	count, err := p.reader.Read(buffer)
	if count > 0 {
		p.downloaded += int64(count)
		now := time.Now()
		shouldEmit := p.downloaded == p.total || p.lastEmitTime.IsZero() || now.Sub(p.lastEmitTime) >= 200*time.Millisecond
		if p.total > 0 && p.downloaded-p.lastEmitted >= maxInt64(32*1024, p.total/100) {
			shouldEmit = true
		}
		if shouldEmit && p.progress != nil {
			p.lastEmitTime = now
			p.lastEmitted = p.downloaded
			p.progress(p.downloaded, p.total)
		}
	}
	return count, err
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
