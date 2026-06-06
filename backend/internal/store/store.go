package store

import (
	"github.com/omerkurt1/cursor/backend/internal/model"
)

// Store is the persistence interface. MemoryStore is the default implementation;
// swap it with any DB-backed version without touching handlers.
type Store interface {
	// Save replaces the current detections with a new batch.
	Save(detections []model.Detection, source string)

	// Query returns (filtered slice, total-before-pagination, source label).
	Query(params model.FilterParams) ([]model.Detection, int, string)

	// Stats returns aggregated statistics across all stored detections.
	Stats() model.Stats
}
