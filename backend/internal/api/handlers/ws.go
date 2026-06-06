package handlers

import (
	"net/http"

	"github.com/omerkurt1/cursor/backend/internal/ws"
)

// WsDeps are injected at router build time.
type WsDeps struct {
	Hub *ws.Hub
}

// ServeWS godoc
// GET /ws — upgrades the connection to WebSocket; the hub manages the lifecycle.
func ServeWS(d WsDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d.Hub.ServeWS(w, r)
	}
}
