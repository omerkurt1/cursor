# City Intelligence Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a city-wide map dashboard that presents privacy-safe urban issue detections.

**Architecture:** A Vite-powered static application uses pure JavaScript utilities for filtering and statistics, a local sample dataset for demo reliability, and Leaflet for map rendering. Person 1 can later replace the sample dataset while preserving the detection schema.

**Tech Stack:** Vite, vanilla JavaScript, Leaflet, Vitest, HTML, CSS

---

### Task 1: Dashboard Logic

**Files:**
- Create: `package.json`
- Create: `src/dashboard.js`
- Test: `src/dashboard.test.js`

- [ ] Write failing tests for filters and KPI calculations.
- [ ] Run `npm test` and confirm failure because `src/dashboard.js` is missing.
- [ ] Implement `filterDetections` and `calculateStats`.
- [ ] Run `npm test` and confirm all tests pass.

### Task 2: Dataset And Interface

**Files:**
- Create: `index.html`
- Create: `src/data.js`
- Create: `src/main.js`
- Create: `src/styles.css`

- [ ] Add representative multi-district sample detections.
- [ ] Build the responsive dashboard shell, map, controls, KPI cards, issue list, and privacy panel.
- [ ] Connect controls, markers, cards, and list to the dashboard utilities.
- [ ] Run `npm run build` and confirm the production build succeeds.

### Task 3: End-To-End Verification

**Files:**
- Verify: all application files

- [ ] Start the local development server.
- [ ] Open the dashboard in a browser and verify map, filters, KPI cards, issue details, mobile layout, and privacy panel.
- [ ] Run `npm test` and `npm run build` once more after visual verification.
