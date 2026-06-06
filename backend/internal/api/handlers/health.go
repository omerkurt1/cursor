package handlers

import (
	"encoding/json"
	"net/http"
	"time"
)

// HealthDeps are injected at router build time.
type HealthDeps struct {
	PipelineAlive func() bool
	Version       string
}

// Health godoc
// GET /health — returns 200 when the Go service is up; includes pipeline status.
func Health(d HealthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pipelineOK := d.PipelineAlive()
		resp := map[string]any{
			"status":          "ok",
			"version":         d.Version,
			"time":            time.Now().UTC(),
			"pipeline_status": boolToStatus(pipelineOK),
		}

		code := http.StatusOK
		if !pipelineOK {
			resp["status"] = "degraded"
			code = http.StatusOK // still 200 — Go itself is healthy
		}

		writeJSON(w, code, resp)
	}
}

func boolToStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "unreachable"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg, errCode string) {
	writeJSON(w, code, map[string]string{"error": msg, "code": errCode})
}
