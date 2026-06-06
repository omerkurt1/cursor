package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	PipelineURL    string
	CacheTTL       time.Duration
	AllowedOrigins []string
	RateLimitRPS   int
}

func Load() (*Config, error) {
	port := getenv("PORT", "8080")
	pipelineURL := strings.TrimRight(getenv("PIPELINE_URL", "http://localhost:8000"), "/")

	ttlSec, err := strconv.Atoi(getenv("CACHE_TTL_SECONDS", "30"))
	if err != nil {
		return nil, fmt.Errorf("invalid CACHE_TTL_SECONDS: %w", err)
	}

	rps, err := strconv.Atoi(getenv("RATE_LIMIT_RPS", "30"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_RPS: %w", err)
	}

	originsRaw := getenv("ALLOWED_ORIGINS", "*")
	var origins []string
	for _, o := range strings.Split(originsRaw, ",") {
		if t := strings.TrimSpace(o); t != "" {
			origins = append(origins, t)
		}
	}

	return &Config{
		Port:           port,
		PipelineURL:    pipelineURL,
		CacheTTL:       time.Duration(ttlSec) * time.Second,
		AllowedOrigins: origins,
		RateLimitRPS:   rps,
	}, nil
}

func (c *Config) Addr() string {
	return ":" + c.Port
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
