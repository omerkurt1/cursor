package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/omerkurt1/cursor/backend/internal/api/handlers"
	"github.com/omerkurt1/cursor/backend/internal/model"
	"github.com/omerkurt1/cursor/backend/internal/pipeline"
	"github.com/omerkurt1/cursor/backend/internal/store"
)

// ── Test fixtures ────────────────────────────────────────────────────────────

var sampleDetections = []model.Detection{
	{Type: "traffic_sign", Latitude: 41.01, Longitude: 28.87, Confidence: 0.90, Timestamp: "00:00:05"},
	{Type: "traffic_sign", Latitude: 41.02, Longitude: 28.88, Confidence: 0.85, Timestamp: "00:00:10"},
	{Type: "pothole", Latitude: 41.03, Longitude: 28.89, Confidence: 0.70, Timestamp: "00:00:20"},
	{Type: "damaged_sign", Latitude: 41.04, Longitude: 28.90, Confidence: 0.50, Timestamp: "00:00:30"},
	{Type: "traffic_light", Latitude: 41.05, Longitude: 28.91, Confidence: 0.95, Timestamp: "00:00:40"},
}

func populatedStore() store.Store {
	s := store.NewMemoryStore()
	s.Save(sampleDetections, "real")
	return s
}

// stubPipeline starts a local test server returning a fixed JSON response.
func stubPipeline(t *testing.T, detections []model.Detection) *pipeline.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Data-Source", "real")
		_ = json.NewEncoder(w).Encode(detections)
	}))
	t.Cleanup(srv.Close)
	return pipeline.NewClient(srv.URL, 30*time.Second)
}

// ── GetDetections tests ──────────────────────────────────────────────────────

func TestGetDetections_NoFilter(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections", nil)
	w := httptest.NewRecorder()
	h(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp model.DetectionsResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Total != len(sampleDetections) {
		t.Errorf("expected total=%d, got %d", len(sampleDetections), resp.Total)
	}
}

func TestGetDetections_TypeFilter(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections?type=traffic_sign", nil)
	w := httptest.NewRecorder()
	h(w, req)

	var resp model.DetectionsResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	for _, d := range resp.Data {
		if d.Type != "traffic_sign" {
			t.Errorf("expected only traffic_sign, got %q", d.Type)
		}
	}
	if resp.Total != 2 {
		t.Errorf("expected 2 traffic_sign, got %d", resp.Total)
	}
}

func TestGetDetections_MinConfidenceFilter(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections?min_confidence=0.85", nil)
	w := httptest.NewRecorder()
	h(w, req)

	var resp model.DetectionsResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	for _, d := range resp.Data {
		if d.Confidence < 0.85 {
			t.Errorf("confidence %f below threshold", d.Confidence)
		}
	}
}

func TestGetDetections_BBoxFilter(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	// Only the first two detections fall inside this bbox
	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections?bbox=41.0,28.86,41.025,28.885", nil)
	w := httptest.NewRecorder()
	h(w, req)

	var resp model.DetectionsResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	if resp.Total != 2 {
		t.Errorf("expected 2 results inside bbox, got %d", resp.Total)
	}
}

func TestGetDetections_BadMinConfidence(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections?min_confidence=abc", nil)
	w := httptest.NewRecorder()
	h(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestGetDetections_Pagination(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetDetections(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections?limit=2&offset=0", nil)
	w := httptest.NewRecorder()
	h(w, req)

	var resp model.DetectionsResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	if len(resp.Data) != 2 {
		t.Errorf("expected page size 2, got %d", len(resp.Data))
	}
	if resp.Total != len(sampleDetections) {
		t.Errorf("total should reflect unfiltered count, got %d", resp.Total)
	}
}

// ── GetStats tests ────────────────────────────────────────────────────────────

func TestGetStats(t *testing.T) {
	st := populatedStore()
	pc := stubPipeline(t, sampleDetections)
	h := handlers.GetStats(handlers.DetectionsDeps{Store: st, PipelineClient: pc})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/detections/stats", nil)
	w := httptest.NewRecorder()
	h(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var stats model.Stats
	if err := json.NewDecoder(w.Body).Decode(&stats); err != nil {
		t.Fatal(err)
	}
	if stats.Total != len(sampleDetections) {
		t.Errorf("expected total=%d, got %d", len(sampleDetections), stats.Total)
	}
	if stats.ByType["traffic_sign"] != 2 {
		t.Errorf("expected 2 traffic_sign in stats, got %d", stats.ByType["traffic_sign"])
	}
	if stats.AvgConfidence <= 0 {
		t.Error("avg_confidence should be positive")
	}
}

// ── MemoryStore unit tests ────────────────────────────────────────────────────

func TestMemoryStore_QueryEmptySlice(t *testing.T) {
	s := store.NewMemoryStore()
	_, total, _ := s.Query(model.FilterParams{Limit: 50})
	if total != 0 {
		t.Errorf("expected total=0 on empty store, got %d", total)
	}
}

// Ensure HealthCheck respects context cancellation.
func TestPipelineHealthCheck_Timeout(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Block until the request context is cancelled (avoids goroutine leak)
		<-r.Context().Done()
	}))
	defer slow.Close()

	pc := pipeline.NewClient(slow.URL, 30*time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if pc.HealthCheck(ctx) {
		t.Error("expected health check to fail on slow server with short timeout")
	}
}
