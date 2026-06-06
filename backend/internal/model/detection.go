package model

import "time"

// Detection is a single urban object detection from the AI pipeline.
// Fields are intentionally minimal — no identity data per KVKK rules.
type Detection struct {
	Type       string  `json:"type"`
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
	Confidence float64 `json:"confidence"`
	Timestamp  string  `json:"timestamp"`
}

// BBox is a geographic bounding box filter.
type BBox struct {
	MinLat float64
	MinLng float64
	MaxLat float64
	MaxLng float64
}

func (b BBox) Contains(lat, lng float64) bool {
	return lat >= b.MinLat && lat <= b.MaxLat &&
		lng >= b.MinLng && lng <= b.MaxLng
}

// FilterParams holds all query parameters for GET /api/v1/detections.
type FilterParams struct {
	Type          string
	MinConfidence float64
	BBox          *BBox
	Limit         int
	Offset        int
}

// DetectionsResponse is the envelope returned by GET /api/v1/detections.
type DetectionsResponse struct {
	Data     []Detection `json:"data"`
	Total    int         `json:"total"`
	Source   string      `json:"source"`
	CachedAt time.Time   `json:"cached_at"`
}

// Stats is returned by GET /api/v1/detections/stats.
type Stats struct {
	Total         int            `json:"total"`
	ByType        map[string]int `json:"by_type"`
	AvgConfidence float64        `json:"avg_confidence"`
	Source        string         `json:"source"`
}

// ScanRequest is the body for POST /api/v1/scan.
type ScanRequest struct {
	Lat          float64    `json:"lat"`
	Lng          float64    `json:"lng"`
	Waypoints    []LatLng   `json:"waypoints,omitempty"`
	DemoFallback bool       `json:"demo_fallback"`
	DemoNoAPI    bool       `json:"demo_no_api"`
	APIKey       string     `json:"api_key,omitempty"`
}

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// WsEvent is broadcast over WebSocket to all connected clients.
type WsEvent struct {
	Event   string `json:"event"`
	Payload any    `json:"payload"`
}

// Allowed detection types — mirrors validate_outputs.py
var AllowedTypes = map[string]bool{
	"traffic_sign":  true,
	"traffic_light": true,
	"pothole":       true,
	"damaged_sign":  true,
}
