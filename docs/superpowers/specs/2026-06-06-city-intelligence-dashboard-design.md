# City Intelligence Dashboard Design

## Goal

Build a presentation-ready, city-wide dashboard that turns privacy-safe urban object detections into actionable municipal information.

## Scope

- Show road damage, damaged signs, and overflowing waste containers.
- Display detections from multiple districts on an interactive map.
- Filter by district, issue type, priority, and status.
- Show total, urgent, resolved, and covered-district statistics.
- Explain that faces and license plates are anonymized before analysis and raw footage is deleted after processing.

## Data Contract

Each detection contains `id`, `district`, `type`, `latitude`, `longitude`, `confidence`, `priority`, `status`, and `detectedAt`.

The dashboard stores no identity, face, license-plate, person-tracking, or vehicle-tracking data.

## Architecture

A lightweight Vite application loads sample detections from a local JavaScript dataset. Pure utility functions calculate filtered results and statistics. Leaflet renders detection markers and automatically frames all available locations.

## Demo Success

The presenter can open the dashboard, explain the city-wide operational view, filter issues, inspect a marker, and show the privacy-by-design workflow without depending on Person 1's AI pipeline.
