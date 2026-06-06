package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/omerkurt1/cursor/backend/internal/api"
	"github.com/omerkurt1/cursor/backend/internal/config"
	"github.com/omerkurt1/cursor/backend/internal/pipeline"
	"github.com/omerkurt1/cursor/backend/internal/store"
	"github.com/omerkurt1/cursor/backend/internal/ws"
)

const version = "0.1.0"

func main() {
	// ── Structured JSON logging ─────────────────────────────────────────────
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// ── Config ──────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}
	slog.Info("starting city-backend",
		"version", version,
		"addr", cfg.Addr(),
		"pipeline_url", cfg.PipelineURL,
		"cache_ttl", cfg.CacheTTL,
		"rate_limit_rps", cfg.RateLimitRPS,
	)

	// ── Core dependencies ────────────────────────────────────────────────────
	memStore := store.NewMemoryStore()
	pipelineClient := pipeline.NewClient(cfg.PipelineURL, cfg.CacheTTL)
	hub := ws.NewHub()

	// ── Router ───────────────────────────────────────────────────────────────
	router := api.NewRouter(api.Deps{
		Cfg:            cfg,
		Store:          memStore,
		PipelineClient: pipelineClient,
		Hub:            hub,
		Version:        version,
	})

	// ── HTTP server ──────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         cfg.Addr(),
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 35 * time.Second, // must exceed the chi Timeout middleware (30s)
		IdleTimeout:  120 * time.Second,
	}

	srvErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", cfg.Addr())
		srvErr <- srv.ListenAndServe()
	}()

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-srvErr:
		if err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	case sig := <-quit:
		slog.Info("shutdown signal received", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
		os.Exit(1)
	}
	slog.Info("server stopped")
}
