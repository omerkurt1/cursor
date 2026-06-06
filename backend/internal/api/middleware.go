package api

import (
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"sync"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// JSONLogger logs each request as a structured JSON line via slog.
func JSONLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		defer func() {
			slog.Info("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", middleware.GetReqID(r.Context()),
				"remote", r.RemoteAddr,
			)
		}()

		next.ServeHTTP(ww, r)
	})
}

// Recovery catches panics, logs the stack trace, and returns 500.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered",
					"err", rec,
					"stack", string(debug.Stack()),
					"request_id", middleware.GetReqID(r.Context()),
				)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "internal server error",
					"code":  "INTERNAL_ERROR",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// ipBucket tracks per-IP token-bucket state.
type ipBucket struct {
	tokens float64
	last   time.Time
}

// RateLimiter returns a sliding-window token-bucket rate limiter middleware.
// rps is the allowed requests per second per client IP.
func RateLimiter(rps int) func(http.Handler) http.Handler {
	if rps <= 0 {
		rps = 30
	}

	var (
		mu      sync.Mutex
		buckets = make(map[string]*ipBucket)
	)

	// Evict stale entries every 5 minutes
	go func() {
		for range time.Tick(5 * time.Minute) {
			mu.Lock()
			for ip, b := range buckets {
				if time.Since(b.last) > 10*time.Minute {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}

			now := time.Now()
			mu.Lock()
			b, ok := buckets[ip]
			if !ok {
				b = &ipBucket{tokens: float64(rps), last: now}
				buckets[ip] = b
			}
			elapsed := now.Sub(b.last).Seconds()
			b.tokens += elapsed * float64(rps)
			if b.tokens > float64(rps) {
				b.tokens = float64(rps)
			}
			b.last = now
			allowed := b.tokens >= 1
			if allowed {
				b.tokens--
			}
			mu.Unlock()

			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "1")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "rate limit exceeded",
					"code":  "RATE_LIMITED",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
