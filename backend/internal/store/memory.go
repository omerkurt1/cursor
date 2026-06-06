package store

import (
	"math"
	"sync"
	"time"

	"github.com/omerkurt1/cursor/backend/internal/model"
)

// MemoryStore holds detections in-process with an RWMutex for safe concurrent access.
type MemoryStore struct {
	mu         sync.RWMutex
	detections []model.Detection
	source     string
	savedAt    time.Time
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{}
}

func (s *MemoryStore) Save(detections []model.Detection, source string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.detections = detections
	s.source = source
	s.savedAt = time.Now()
}

func (s *MemoryStore) Query(p model.FilterParams) ([]model.Detection, int, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if p.Limit <= 0 {
		p.Limit = 50
	}
	if p.Limit > 200 {
		p.Limit = 200
	}

	var filtered []model.Detection
	for _, d := range s.detections {
		if p.Type != "" && d.Type != p.Type {
			continue
		}
		if p.MinConfidence > 0 && d.Confidence < p.MinConfidence {
			continue
		}
		if p.BBox != nil && !p.BBox.Contains(d.Latitude, d.Longitude) {
			continue
		}
		filtered = append(filtered, d)
	}

	total := len(filtered)
	start := p.Offset
	if start > total {
		start = total
	}
	end := start + p.Limit
	if end > total {
		end = total
	}

	return filtered[start:end], total, s.source
}

func (s *MemoryStore) Stats() model.Stats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	byType := make(map[string]int)
	var sumConf float64

	for _, d := range s.detections {
		byType[d.Type]++
		sumConf += d.Confidence
	}

	avg := 0.0
	if len(s.detections) > 0 {
		avg = math.Round(sumConf/float64(len(s.detections))*100) / 100
	}

	return model.Stats{
		Total:         len(s.detections),
		ByType:        byType,
		AvgConfidence: avg,
		Source:        s.source,
	}
}
