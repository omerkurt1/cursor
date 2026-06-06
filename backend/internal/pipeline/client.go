package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/omerkurt1/cursor/backend/internal/model"
	"github.com/omerkurt1/cursor/backend/internal/store"
	"github.com/omerkurt1/cursor/backend/internal/ws"
)

// Client proxies requests to the Python AI pipeline service.
type Client struct {
	baseURL    string
	httpClient *http.Client
	cacheTTL   time.Duration

	mu         sync.RWMutex
	cache      []model.Detection
	cacheAt    time.Time
	cacheSource string
}

func NewClient(baseURL string, cacheTTL time.Duration) *Client {
	return &Client{
		baseURL:  baseURL,
		cacheTTL: cacheTTL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// FetchDetections returns detections from the Python pipeline, using the in-memory
// cache when the data is fresh enough. Returns (detections, source, error).
func (c *Client) FetchDetections(ctx context.Context) ([]model.Detection, string, error) {
	c.mu.RLock()
	if time.Since(c.cacheAt) < c.cacheTTL && c.cache != nil {
		d, src := c.cache, c.cacheSource
		c.mu.RUnlock()
		return d, src, nil
	}
	c.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/detections", nil)
	if err != nil {
		return nil, "", err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return c.fallbackCache()
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.fallbackCache()
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return c.fallbackCache()
	}

	var detections []model.Detection
	if err := json.Unmarshal(body, &detections); err != nil {
		return c.fallbackCache()
	}

	source := "real"
	if resp.Header.Get("X-Data-Source") == "sample" {
		source = "sample"
	}

	c.mu.Lock()
	c.cache = detections
	c.cacheAt = time.Now()
	c.cacheSource = source
	c.mu.Unlock()

	return detections, source, nil
}

func (c *Client) fallbackCache() ([]model.Detection, string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.cache != nil {
		slog.Warn("pipeline unreachable, serving stale cache", "age", time.Since(c.cacheAt).Round(time.Second))
		return c.cache, c.cacheSource, nil
	}
	return nil, "", fmt.Errorf("pipeline unreachable and no cache available")
}

// ScanStatus mirrors the Python pipeline's /api/scan/status payload.
type ScanStatus struct {
	Running   bool   `json:"running"`
	Completed bool   `json:"completed"`
	Error     string `json:"error,omitempty"`
}

// GetScanStatus returns the current scan status from the Python pipeline.
func (c *Client) GetScanStatus(ctx context.Context) (*ScanStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/scan/status", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var status ScanStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, err
	}
	return &status, nil
}

// TriggerScan sends a POST /api/scan to the Python pipeline.
func (c *Client) TriggerScan(ctx context.Context, body io.Reader) (int, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/scan", body)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	return resp.StatusCode, respBody, err
}

// PollScanUntilDone polls /api/scan/status every second until the scan finishes,
// broadcasting WebSocket events along the way, then refreshes the store.
func (c *Client) PollScanUntilDone(ctx context.Context, hub *ws.Hub, st store.Store, payload any) {
	hub.Broadcast(model.WsEvent{Event: "scan_started", Payload: payload})

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			hub.Broadcast(model.WsEvent{Event: "scan_failed", Payload: map[string]string{"error": "context cancelled"}})
			return

		case <-timeout:
			hub.Broadcast(model.WsEvent{Event: "scan_failed", Payload: map[string]string{"error": "scan timed out"}})
			return

		case <-ticker.C:
			status, err := c.GetScanStatus(ctx)
			if err != nil {
				slog.Warn("poll: scan status error", "err", err)
				hub.Broadcast(model.WsEvent{Event: "scan_progress", Payload: map[string]string{"status": "polling"}})
				continue
			}

			if status.Error != "" {
				hub.Broadcast(model.WsEvent{Event: "scan_failed", Payload: map[string]string{"error": status.Error}})
				return
			}

			if status.Running {
				hub.Broadcast(model.WsEvent{Event: "scan_progress", Payload: map[string]string{"status": "running"}})
				continue
			}

			if status.Completed {
				// Invalidate cache and fetch fresh detections
				c.mu.Lock()
				c.cacheAt = time.Time{}
				c.mu.Unlock()

				detections, source, err := c.FetchDetections(ctx)
				if err != nil {
					hub.Broadcast(model.WsEvent{Event: "scan_failed", Payload: map[string]string{"error": err.Error()}})
					return
				}
				st.Save(detections, source)
				hub.Broadcast(model.WsEvent{Event: "scan_completed", Payload: map[string]any{
					"detection_count": len(detections),
					"source":          source,
				}})
				return
			}

			// Neither running nor completed yet — keep polling
			hub.Broadcast(model.WsEvent{Event: "scan_progress", Payload: map[string]string{"status": "starting"}})
		}
	}
}

// HealthCheck returns true if the Python pipeline /health endpoint responds 200.
func (c *Client) HealthCheck(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
