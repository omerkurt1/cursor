package api

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"

	"github.com/omerkurt1/cursor/backend/internal/api/handlers"
	"github.com/omerkurt1/cursor/backend/internal/config"
	"github.com/omerkurt1/cursor/backend/internal/pipeline"
	"github.com/omerkurt1/cursor/backend/internal/store"
	"github.com/omerkurt1/cursor/backend/internal/ws"
)

// Deps bundles all dependencies required to build the router.
type Deps struct {
	Cfg            *config.Config
	Store          store.Store
	PipelineClient *pipeline.Client
	Hub            *ws.Hub
	Version        string
}

// NewRouter assembles the full chi router with all middleware and routes.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()

	// ── Middleware stack ────────────────────────────────────────────────────
	c := cors.New(cors.Options{
		AllowedOrigins:   d.Cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	})
	r.Use(c.Handler)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(Recovery)
	r.Use(JSONLogger)
	r.Use(RateLimiter(d.Cfg.RateLimitRPS))
	r.Use(middleware.Timeout(30 * time.Second))

	// ── Routes ─────────────────────────────────────────────────────────────
	r.Get("/health", handlers.Health(handlers.HealthDeps{
		PipelineAlive: func() bool {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			return d.PipelineClient.HealthCheck(ctx)
		},
		Version: d.Version,
	}))

	r.Get("/ws", handlers.ServeWS(handlers.WsDeps{Hub: d.Hub}))

	r.Route("/api/v1", func(r chi.Router) {
		detDeps := handlers.DetectionsDeps{
			Store:          d.Store,
			PipelineClient: d.PipelineClient,
		}
		r.Get("/detections", handlers.GetDetections(detDeps))
		r.Get("/detections/stats", handlers.GetStats(detDeps))

		scanDeps := handlers.ScanDeps{
			PipelineClient: d.PipelineClient,
			Hub:            d.Hub,
			Store:          d.Store,
		}
		r.Post("/scan", handlers.PostScan(scanDeps))
		r.Get("/scan/status", handlers.GetScanStatus(scanDeps))
	})

	return r
}
