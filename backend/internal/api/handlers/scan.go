package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/omerkurt1/cursor/backend/internal/model"
	"github.com/omerkurt1/cursor/backend/internal/pipeline"
	"github.com/omerkurt1/cursor/backend/internal/store"
	"github.com/omerkurt1/cursor/backend/internal/ws"
)

// ScanDeps are injected at router build time.
type ScanDeps struct {
	PipelineClient *pipeline.Client
	Hub            *ws.Hub
	Store          store.Store
}

// PostScan godoc
// POST /api/v1/scan — forwards the request body to the Python pipeline,
// then launches a background goroutine to poll progress and broadcast WS events.
func PostScan(d ScanDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 4<<10))
		if err != nil {
			writeError(w, http.StatusBadRequest, "could not read request body", "BAD_REQUEST")
			return
		}

		// Validate JSON
		var req model.ScanRequest
		if len(body) > 0 {
			if err := json.Unmarshal(body, &req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON body", "BAD_REQUEST")
				return
			}
		}

		status, respBody, err := d.PipelineClient.TriggerScan(r.Context(), bytes.NewReader(body))
		if err != nil {
			writeError(w, http.StatusBadGateway, "pipeline unreachable", "PIPELINE_UNAVAILABLE")
			return
		}

		if status == http.StatusConflict {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write(respBody)
			return
		}

		if status >= 400 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = w.Write(respBody)
			return
		}

		// Start polling in the background; do not block the HTTP response
		go d.PipelineClient.PollScanUntilDone(r.Context(), d.Hub, d.Store, req)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write(respBody)
	}
}

// GetScanStatus godoc
// GET /api/v1/scan/status — proxies to the Python pipeline scan status endpoint.
func GetScanStatus(d ScanDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		scanStatus, err := d.PipelineClient.GetScanStatus(r.Context())
		if err != nil {
			writeError(w, http.StatusBadGateway, "pipeline unreachable", "PIPELINE_UNAVAILABLE")
			return
		}
		writeJSON(w, http.StatusOK, scanStatus)
	}
}
