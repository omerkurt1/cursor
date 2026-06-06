package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/omerkurt1/cursor/backend/internal/model"
	"github.com/omerkurt1/cursor/backend/internal/pipeline"
	"github.com/omerkurt1/cursor/backend/internal/store"
)

// DetectionsDeps are injected at router build time.
type DetectionsDeps struct {
	Store          store.Store
	PipelineClient *pipeline.Client
}

// GetDetections godoc
// GET /api/v1/detections
// Query params: type, min_confidence, bbox, limit, offset
func GetDetections(d DetectionsDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, err := parseFilterParams(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
			return
		}

		// Ensure the store is populated
		if err := refreshStore(r.Context(), d.Store, d.PipelineClient); err != nil {
			writeError(w, http.StatusBadGateway, "pipeline unavailable", "PIPELINE_UNAVAILABLE")
			return
		}

		detections, total, source := d.Store.Query(p)
		if detections == nil {
			detections = []model.Detection{}
		}

		writeJSON(w, http.StatusOK, model.DetectionsResponse{
			Data:     detections,
			Total:    total,
			Source:   source,
			CachedAt: time.Now().UTC(),
		})
	}
}

// GetStats godoc
// GET /api/v1/detections/stats
func GetStats(d DetectionsDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := refreshStore(r.Context(), d.Store, d.PipelineClient); err != nil {
			writeError(w, http.StatusBadGateway, "pipeline unavailable", "PIPELINE_UNAVAILABLE")
			return
		}
		writeJSON(w, http.StatusOK, d.Store.Stats())
	}
}

// refreshStore fetches fresh detections from the pipeline client and saves them
// into the store only when the store is empty (bootstrap path).
// Subsequent refreshes are driven by scan completion via PollScanUntilDone.
func refreshStore(ctx context.Context, st store.Store, pc *pipeline.Client) error {
	stats := st.Stats()
	if stats.Total > 0 {
		return nil // already populated
	}
	detections, source, err := pc.FetchDetections(ctx)
	if err != nil {
		return err
	}
	st.Save(detections, source)
	return nil
}

// parseFilterParams extracts and validates query parameters.
func parseFilterParams(r *http.Request) (model.FilterParams, error) {
	q := r.URL.Query()
	p := model.FilterParams{
		Type:   q.Get("type"),
		Limit:  50,
		Offset: 0,
	}

	if v := q.Get("min_confidence"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil || f < 0 || f > 1 {
			return p, fmt.Errorf("min_confidence must be 0..1")
		}
		p.MinConfidence = f
	}

	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return p, fmt.Errorf("limit must be a positive integer")
		}
		p.Limit = n
	}

	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return p, fmt.Errorf("offset must be a non-negative integer")
		}
		p.Offset = n
	}

	if v := q.Get("bbox"); v != "" {
		parts := strings.Split(v, ",")
		if len(parts) != 4 {
			return p, fmt.Errorf("bbox must be minLat,minLng,maxLat,maxLng")
		}
		coords := make([]float64, 4)
		for i, s := range parts {
			f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
			if err != nil {
				return p, fmt.Errorf("bbox: invalid coordinate %q", s)
			}
			coords[i] = f
		}
		p.BBox = &model.BBox{
			MinLat: coords[0],
			MinLng: coords[1],
			MaxLat: coords[2],
			MaxLng: coords[3],
		}
	}

	return p, nil
}
