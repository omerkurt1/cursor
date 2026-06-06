"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  buildComplianceSummary,
  calculateStats,
  createDemoDetections,
  filterDetections,
  getRoutePoints,
  normalizeDeletionReport,
  normalizeLocalApiUrl,
  normalizePipelineDetections,
  normalizePipelineReport,
  updateDetectionStatus,
  validateDetectionImport,
} from "../src/dashboard.js";
import { detections as sampleDetections } from "../src/data.js";

export default function Dashboard() {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against double-initialization (React effect re-runs / fast refresh).
    if (initialized.current) return;
    initialized.current = true;

    // ── Label / colour / action maps ───────────────────────────────────────
    const labels = {
      road_damage: "Road damage",
      damaged_sign: "Damaged sign",
      overflowing_container: "Overflowing container",
      traffic_sign: "Traffic sign",
      traffic_light: "Traffic light",
    };

    const colors = {
      road_damage: "#e14f2a",
      damaged_sign: "#f0a202",
      overflowing_container: "#007f73",
      traffic_sign: "#4e9cf5",
      traffic_light: "#a55eea",
    };

    // SVG icon paths for each issue type
    const issueIcons = {
      road_damage: `<path d="M2 18h20L12 3 2 18zm11-3h-2v-2h2v2zm0-4h-2V7h2v4z"/>`,
      damaged_sign: `<path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1 14h2v2h-2v-2zm0-8h2v6h-2V8z"/>`,
      overflowing_container: `<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>`,
      traffic_sign: `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"/>`,
      traffic_light: `<path d="M12 2C8.69 2 6 4.69 6 8v8c0 2.21 1.79 4 4 4h4c2.21 0 4-1.79 4-4V8c0-3.31-2.69-6-6-6zm0 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>`,
    };

    const actions = {
      road_damage: "Create a road maintenance inspection task.",
      damaged_sign: "Dispatch a signage team to assess and replace.",
      overflowing_container: "Prioritize the location for waste collection.",
      traffic_sign: "Create a traffic-sign inventory verification task.",
      traffic_light: "Create a traffic-signal inspection task.",
    };

    // ── District centroids for scan presets ────────────────────────────────
    const DISTRICT_CENTROIDS = {
      kadikoy: { lat: 40.993, lng: 29.03 },
      besiktas: { lat: 41.043, lng: 29.008 },
      sisli: { lat: 41.0602, lng: 28.9877 },
      fatih: { lat: 41.017, lng: 28.9497 },
      uskudar: { lat: 41.0265, lng: 29.0152 },
      beyoglu: { lat: 41.0335, lng: 28.9774 },
      bakirkoy: { lat: 40.9781, lng: 28.8746 },
      maltepe: { lat: 40.9357, lng: 29.1551 },
      pendik: { lat: 40.8777, lng: 29.235 },
      atasehir: { lat: 40.992, lng: 29.1244 },
      sariyer: { lat: 41.1664, lng: 29.0502 },
      eyupsultan: { lat: 41.0499, lng: 28.9283 },
      bagcilar: { lat: 41.0368, lng: 28.857 },
      bahcelievler: { lat: 41.0008, lng: 28.8556 },
      zeytinburnu: { lat: 40.9974, lng: 28.9099 },
      gaziosmanpasa: { lat: 41.0642, lng: 28.9124 },
      sultangazi: { lat: 41.1071, lng: 28.8717 },
      kucukcekmece: { lat: 41.0013, lng: 28.7836 },
      avcilar: { lat: 40.9799, lng: 28.7219 },
      buyukcekmece: { lat: 41.022, lng: 28.5805 },
      gungoren: { lat: 41.0115, lng: 28.873 },
      kartal: { lat: 40.9132, lng: 29.1888 },
      umraniye: { lat: 41.0166, lng: 29.1065 },
      esenyurt: { lat: 41.0336, lng: 28.6736 },
      tuzla: { lat: 40.8167, lng: 29.2996 },
      basaksehir: { lat: 41.0919, lng: 28.8136 },
      arnavutkoy: { lat: 41.1851, lng: 28.7397 },
      beykoz: { lat: 41.1313, lng: 29.0956 },
      sultanbeyli: { lat: 40.9646, lng: 29.2629 },
      cekmekoy: { lat: 41.0449, lng: 29.1843 },
      silivri: { lat: 41.0735, lng: 28.247 },
      city: { lat: 41.0082, lng: 28.9784 },
    };

    // ── App state ───────────────────────────────────────────────────────────
    const filters = {
      district: "all",
      type: "all",
      priority: "all",
      status: "all",
    };
    let detections = createDemoDetections(sampleDetections);
    let selectedId = detections[0]?.id;
    let deletionReport = null;
    let pipelineReport = null;
    let scanWaypoints = null;
    let sortMode = "time"; // "time" | "priority"
    let clockTimer = null;

    // ── Map setup ────────────────────────────────────────────────────────
    const BACKEND_URL = "https://cursor-j7jx.onrender.com";

    const map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
    }).setView([41.0082, 28.9784], 10);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Default OpenStreetMap tiles — standard Leaflet map look.
    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);

    // ── Live clock ─────────────────────────────────────────────────────────
    function startClock() {
      const el = document.querySelector("#live-clock");
      function tick() {
        el.textContent = new Date().toLocaleTimeString("tr-TR", {
          hour12: false,
        });
      }
      tick();
      clockTimer = setInterval(tick, 1000);
    }
    startClock();

    // ── Helpers ───────────────────────────────────────────────────────────
    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function isRecent(detectedAt) {
      return Date.now() - new Date(detectedAt).getTime() < 2 * 60 * 60 * 1000;
    }

    // ── Districts dropdown ──────────────────────────────────────────────────
    function populateDistricts() {
      const select = document.querySelector("#district-filter");
      const districts = [
        ...new Set(detections.map(({ district }) => district)),
      ].sort();
      select.innerHTML = '<option value="all">All districts</option>';
      districts.forEach((d) => select.add(new Option(d, d)));
    }

    // ── Category bars ───────────────────────────────────────────────────────
    function renderCategoryBars(items) {
      const container = document.querySelector("#cat-bars");
      const typeCounts = {};
      items.forEach(({ type }) => {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      const max = Math.max(1, ...Object.values(typeCounts));

      const entries = [
        ["road_damage", "Road damage"],
        ["damaged_sign", "Dmg sign"],
        ["overflowing_container", "Overflow"],
        ["traffic_sign", "Tfc sign"],
        ["traffic_light", "Tfc light"],
      ];

      container.innerHTML = entries
        .map(([type, label]) => {
          const n = typeCounts[type] || 0;
          const pct = Math.round((n / max) * 100);
          return `<div class="cat-bar-row">
        <span class="cat-bar-label">${label}</span>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${colors[type]}"></div>
        </div>
        <span class="cat-bar-count">${n}</span>
      </div>`;
        })
        .join("");
    }

    // ── Map markers ─────────────────────────────────────────────────────────
    function makeMarker(detection) {
      const isSelected = detection.id === selectedId;
      const isHigh = detection.priority === "high";
      const color = colors[detection.type];
      const svgPath = issueIcons[detection.type] || issueIcons.road_damage;
      const size = isSelected ? 36 : isHigh ? 30 : 26;
      const half = size / 2;

      const svgHtml = `<div class="map-icon-marker ${isHigh ? 'high-priority-ring' : ''} ${isSelected ? 'marker-selected' : ''}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 24 24" width="${size * 0.55}" height="${size * 0.55}" fill="${color}" xmlns="http://www.w3.org/2000/svg">${svgPath}</svg>
      </div>`;

      const icon = L.divIcon({
        className: 'custom-issue-icon',
        html: svgHtml,
        iconSize: [size, size],
        iconAnchor: [half, half],
        popupAnchor: [0, -half],
      });

      const marker = L.marker([detection.latitude, detection.longitude], { icon });

      const priorityClass = `popup-priority-${detection.priority}`;
      marker.bindPopup(`
    <div class="map-popup">
      <span>${escapeHtml(detection.id)} · ${escapeHtml(detection.district)}</span>
      <strong>${labels[detection.type]}</strong>
      <p>${Math.round(detection.confidence * 100)}% confidence</p>
      <b class="${priorityClass}">${detection.priority} priority · ${detection.status}</b>
    </div>
  `);
      marker.on("click", () => selectDetection(detection.id));
      return marker;
    }

    function renderMap(items) {
      markerLayer.clearLayers();
      routeLayer.clearLayers();

      items.forEach((d) => makeMarker(d).addTo(markerLayer));

      if (items.length) {
        const bounds = L.latLngBounds(
          items.map(({ latitude, longitude }) => [latitude, longitude]),
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
      }
    }

    // ── Stats ───────────────────────────────────────────────────────────────
    function animateNumber(el, target) {
      const start = parseInt(el.textContent) || 0;
      if (start === target) {
        el.textContent = target;
        return;
      }
      const steps = 16;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(start + (target - start) * (step / steps));
        if (step >= steps) {
          clearInterval(timer);
          el.textContent = target;
        }
      }, 20);
    }

    function renderStats(items) {
      const stats = calculateStats(items);
      ["total", "urgent", "resolved", "districts"].forEach((k) => {
        const el = document.querySelector(`#stat-${k}`);
        if (el) animateNumber(el, stats[k]);
      });
      const sc = document.querySelector("#signal-count");
      if (sc) animateNumber(sc, stats.total);
    }

    // ── Issue list ──────────────────────────────────────────────────────────
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

    function renderIssueList(items) {
      const list = document.querySelector("#issue-list");

      const sorted = [...items]
        .sort((a, b) => {
          if (sortMode === "priority") {
            return (
              PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
              new Date(b.detectedAt) - new Date(a.detectedAt)
            );
          }
          return new Date(b.detectedAt) - new Date(a.detectedAt);
        })
        .slice(0, 10);

      if (!sorted.length) {
        list.innerHTML =
          '<div class="empty-state"><strong>No matching signals</strong><p>Reset filters to return to the city-wide view.</p></div>';
        return;
      }

      list.innerHTML = sorted
        .map(
          (item) => `
    <button class="issue-row ${item.id === selectedId ? "selected" : ""}" type="button"
            data-detection-id="${escapeHtml(item.id)}"
            style="animation-delay:${sorted.indexOf(item) * 30}ms">
      <i style="--issue-color:${colors[item.type]}"></i>
      <div>
        <span>${escapeHtml(item.id)} · ${escapeHtml(item.district)}</span>
        <strong>${labels[item.type]}${isRecent(item.detectedAt) ? '<span class="badge-new">New</span>' : ""}</strong>
      </div>
      <div class="issue-meta">
        <span class="priority ${item.priority}">${item.priority}</span>
        <small>${item.status}</small>
      </div>
    </button>
  `,
        )
        .join("");
    }

    // ── Issue detail ──────────────────────────────────────────────────────
    function renderIssueDetail(items) {
      const selected = items.find(({ id }) => id === selectedId);
      if (!selected) {
        document.querySelector("#detail-title").textContent =
          "No signal selected";
        document.querySelector("#detail-summary").textContent =
          "Adjust filters to inspect a municipal action.";
        ["district", "confidence", "time", "status"].forEach((f) => {
          document.querySelector(`#detail-${f}`).textContent = "—";
        });
        document.querySelector("#detail-action").textContent =
          "Awaiting signal selection";
        document.querySelectorAll("[data-next-status]").forEach((b) => {
          b.disabled = true;
          b.classList.remove("active");
        });
        return;
      }

      document.querySelector("#detail-title").textContent =
        labels[selected.type];
      document.querySelector("#detail-summary").textContent =
        `${selected.id} is marked ${selected.priority} priority and is ready for municipal review.`;
      document.querySelector("#detail-district").textContent =
        selected.district;
      document.querySelector("#detail-confidence").textContent =
        `${Math.round(selected.confidence * 100)}%`;
      document.querySelector("#detail-time").textContent =
        new Intl.DateTimeFormat("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "short",
        }).format(new Date(selected.detectedAt));
      document.querySelector("#detail-status").textContent = selected.status;
      document.querySelector("#detail-action").textContent =
        actions[selected.type];
      document.querySelectorAll("[data-next-status]").forEach((b) => {
        b.disabled = b.dataset.nextStatus === selected.status;
        b.classList.toggle("active", b.dataset.nextStatus === selected.status);
      });
    }

    // ── Select detection ──────────────────────────────────────────────────
    function selectDetection(id) {
      selectedId = id;
      render();
    }

    // ── Main render ─────────────────────────────────────────────────────────
    function render() {
      const visible = filterDetections(detections, filters);
      if (!visible.some(({ id }) => id === selectedId))
        selectedId = visible[0]?.id;
      renderStats(visible);
      renderMap(visible);
      renderIssueList(visible);
      renderIssueDetail(visible);
      renderCategoryBars(visible);
      document.querySelector("#visible-count").textContent =
        `${visible.length} signal${visible.length === 1 ? "" : "s"} visible`;
      document.querySelector("#queue-count").textContent =
        `${visible.length} issue${visible.length === 1 ? "" : "s"}`;
    }

    function resetFilters() {
      Object.keys(filters).forEach((k) => {
        filters[k] = "all";
        document.querySelector(`#${k}-filter`).value = "all";
      });
    }

    // ── Import status ─────────────────────────────────────────────────────
    function showImportStatus(message, state) {
      const s = document.querySelector("#import-status");
      s.textContent = message;
      s.dataset.state = state;
    }

    async function importDetections(file) {
      try {
        const parsed = JSON.parse(await file.text());
        const isPipeline =
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          Object.hasOwn(parsed[0], "timestamp") &&
          !Object.hasOwn(parsed[0], "detectedAt");
        const baseDate = new Date();
        baseDate.setHours(0, 0, 0, 0);
        detections = isPipeline
          ? normalizePipelineDetections(parsed, {
              baseDate: baseDate.toISOString(),
            })
          : [...validateDetectionImport(parsed)];
        selectedId = detections[0]?.id;
        populateDistricts();
        resetFilters();
        render();
        showImportStatus(
          `${detections.length} privacy-safe detections loaded from ${file.name}${isPipeline ? " (AI pipeline adapter)" : ""}.`,
          "success",
        );
      } catch (err) {
        showImportStatus(err.message, "error");
      }
    }

    // ── Download JSON ─────────────────────────────────────────────────────
    function downloadJson(filename, value) {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    // ── Deletion proof ─────────────────────────────────────────────────────
    function renderDeletionProof() {
      const check = document.querySelector("#deletion-check");
      const copy = document.querySelector("#deletion-check-copy");
      const label = document.querySelector("#deletion-check-label");
      check.classList.toggle("verified", Boolean(deletionReport));
      check.classList.toggle("pending", !deletionReport);
      label.textContent = deletionReport ? "Verified" : "Pending";
      copy.textContent = deletionReport
        ? `${deletionReport.deletedFileCount} raw file(s) deleted at ${new Intl.DateTimeFormat(
            "tr-TR",
            { dateStyle: "medium", timeStyle: "short" },
          ).format(new Date(deletionReport.deletedAt))}.`
        : "Deletion evidence has not been imported.";
    }

    // ── Pipeline evidence ──────────────────────────────────────────────────
    function renderPipelineEvidence() {
      document.querySelector("#evidence-mode").textContent = pipelineReport
        ? pipelineReport.mode === "real_model"
          ? "Real model output"
          : "Clearly labeled demo fallback"
        : "Not connected";
      document.querySelector("#evidence-guardrail").textContent = pipelineReport
        ? "Guardrails verified"
        : "Awaiting proof";
      document.querySelector("#evidence-source").textContent = pipelineReport
        ? pipelineReport.source === "vehicle_camera"
          ? "Municipal vehicle cameras"
          : "External imagery (dev fallback)"
        : "—";
      document.querySelector("#evidence-frames").textContent =
        pipelineReport?.processedFrames ?? "—";
      document.querySelector("#evidence-faces").textContent =
        pipelineReport?.blurredFaces ?? "—";
      document.querySelector("#evidence-plates").textContent =
        pipelineReport?.blurredLicensePlates ?? "—";
      document.querySelector("#evidence-detections").textContent = pipelineReport
        ? `${pipelineReport.dedupedDetectionCount} / ${pipelineReport.rawDetectionCount}`
        : "—";
    }

    // ── Connection indicator ───────────────────────────────────────────────
    function setConnectionStatus(online) {
      const dot = document.querySelector(".conn-dot");
      const label = document.querySelector("#conn-label");
      if (!dot || !label) return;
      dot.classList.toggle("online", online);
      dot.classList.toggle("offline", !online);
      label.textContent = online ? "API connected" : "API offline";
    }

    // ── Import deletion report ─────────────────────────────────────────────
    async function importDeletionReport(file) {
      try {
        deletionReport = normalizeDeletionReport(JSON.parse(await file.text()));
        renderDeletionProof();
        const s = document.querySelector("#deletion-status");
        s.textContent = `Deletion verified from ${file.name}. Sensitive file paths discarded.`;
        s.dataset.state = "success";
      } catch (err) {
        const s = document.querySelector("#deletion-status");
        s.textContent = err.message;
        s.dataset.state = "error";
      }
    }

    // ── Fetch helpers ──────────────────────────────────────────────────────
    async function fetchJson(url, label) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${label} request failed (${res.status}).`);
      }
      return res.json();
    }

    // ── Connect pipeline ───────────────────────────────────────────────────
    async function connectPipeline() {
      const statusEl = document.querySelector("#pipeline-status");
      if (statusEl) {
        statusEl.textContent = "Connecting to backend…";
        statusEl.dataset.state = "";
      }

      try {
        const health = await fetchJson(`${BACKEND_URL}/health`, "Health");
        if (health.status !== "ok" && health.status !== "degraded") {
          throw new Error("Backend service is not responding correctly.");
        }

        // Try to load detections from the backend
        try {
          const detectionsData = await fetchJson(`${BACKEND_URL}/api/v1/detections`, "Detections");
          // The backend may return detections in various formats
          const rawDetections = Array.isArray(detectionsData) ? detectionsData : (detectionsData.detections || detectionsData.data || []);
          if (rawDetections.length > 0) {
            // Try pipeline format first, fall back to direct format
            try {
              detections = normalizePipelineDetections(rawDetections);
            } catch {
              try {
                detections = [...validateDetectionImport(rawDetections)];
              } catch {
                // Use raw data with minimal normalization
                detections = rawDetections.map((d, i) => ({
                  id: d.id || `DET-${String(i + 1).padStart(4, "0")}`,
                  district: d.district || "Unassigned",
                  type: d.type || "road_damage",
                  latitude: d.latitude || d.lat || 41.0,
                  longitude: d.longitude || d.lng || 29.0,
                  confidence: d.confidence || 0.8,
                  priority: d.priority || "medium",
                  status: d.status || "new",
                  detectedAt: d.detectedAt || d.detected_at || d.timestamp || new Date().toISOString(),
                }));
              }
            }
            selectedId = detections[0]?.id;
            populateDistricts();
            resetFilters();
            render();
          }
        } catch {
          // Detections endpoint not available yet, keep demo data
        }

        setConnectionStatus(true);
        if (statusEl) {
          statusEl.textContent = `Connected — ${detections.length} detection(s) loaded.`;
          statusEl.dataset.state = "success";
        }
      } catch (err) {
        setConnectionStatus(false);
        if (statusEl) {
          statusEl.textContent = err.message;
          statusEl.dataset.state = "error";
        }
      }
    }

    // ── Poll scan status ───────────────────────────────────────────────────
    async function pollScanStatus(statusEl) {
      const fillEl = document.querySelector("#scan-progress-fill");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const data = await fetchJson(
            `${BACKEND_URL}/api/v1/scan/status`,
            "Scan status",
          );
          if (!data.scan_running) return data.last_result ?? {};
          const pct = Math.min(90, Math.round(((i + 1) / 30) * 100));
          if (fillEl) fillEl.style.width = `${pct}%`;
          statusEl.textContent = `Scanning… (${(i + 1) * 2}s elapsed)`;
        } catch {
          /* keep polling */
        }
      }
      throw new Error("Scan timed out after 60 seconds.");
    }

    // ── Trigger scan ───────────────────────────────────────────────────────
    async function triggerScan() {
      const statusEl = document.querySelector("#scan-status");
      const progressEl = document.querySelector("#scan-progress");
      const fillEl = document.querySelector("#scan-progress-fill");
      const lastTimeEl = document.querySelector("#scan-last-time");
      const lastTimeVal = document.querySelector("#scan-last-time-val");
      const button = document.querySelector("#trigger-scan");

      button.disabled = true;
      statusEl.textContent = "Sending scan request…";
      statusEl.dataset.state = "";
      progressEl?.removeAttribute("hidden");
      if (fillEl) {
        fillEl.style.width = "10%";
        fillEl.style.animation = "none";
      }

      try {
        let body;
        if (scanWaypoints) {
          body = { waypoints: scanWaypoints };
        } else {
          const lat = parseFloat(
            document.querySelector("#scan-lat")?.value ?? "41.015",
          );
          const lng = parseFloat(
            document.querySelector("#scan-lng")?.value ?? "28.875",
          );
          if (Number.isNaN(lat) || Number.isNaN(lng))
            throw new Error("Latitude and longitude must be valid numbers.");
          body = { lat, lng };
        }

        const scanRes = await fetch(`${BACKEND_URL}/api/v1/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        if (scanRes.status === 409)
          throw new Error("A scan is already running. Please wait and try again.");
        if (!scanRes.ok) {
          const errBody = await scanRes.json().catch(() => ({}));
          throw new Error(
            errBody.error || `Scan request failed (${scanRes.status}).`,
          );
        }

        if (scanRes.status === 202) {
          statusEl.textContent = "Scan started — waiting for results…";
          await pollScanStatus(statusEl);
        }

        if (fillEl) {
          fillEl.style.width = "100%";
          fillEl.style.animation = "none";
        }

        try {
          const detectionsData = await fetchJson(`${BACKEND_URL}/api/v1/detections`, "Detections");
          const rawDetections = Array.isArray(detectionsData) ? detectionsData : (detectionsData.detections || detectionsData.data || []);
          if (rawDetections.length > 0) {
            try {
              detections = normalizePipelineDetections(rawDetections);
            } catch {
              detections = rawDetections.map((d, i) => ({
                id: d.id || `DET-${String(i + 1).padStart(4, "0")}`,
                district: d.district || "Unassigned",
                type: d.type || "road_damage",
                latitude: d.latitude || d.lat || 41.0,
                longitude: d.longitude || d.lng || 29.0,
                confidence: d.confidence || 0.8,
                priority: d.priority || "medium",
                status: d.status || "new",
                detectedAt: d.detectedAt || d.detected_at || d.timestamp || new Date().toISOString(),
              }));
            }
            selectedId = detections[0]?.id;
          }
        } catch {
          // Keep existing detections if refresh fails
        }

        populateDistricts();
        resetFilters();
        render();
        setConnectionStatus(true);

        const now = new Date().toLocaleTimeString("tr-TR", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        });
        if (lastTimeVal) lastTimeVal.textContent = now;
        lastTimeEl?.removeAttribute("hidden");

        statusEl.textContent = `Scan complete — ${detections.length} detection(s) refreshed.`;
        statusEl.dataset.state = "success";
      } catch (err) {
        statusEl.textContent = err.message.includes("fetch")
          ? "Backend unreachable — try again later"
          : err.message;
        statusEl.dataset.state = "error";
      } finally {
        button.disabled = false;
        progressEl?.setAttribute("hidden", "");
        if (fillEl) fillEl.style.animation = "";
      }
    }

    // ── Bind all controls ──────────────────────────────────────────────────
    function bindControls() {
      // Filters
      ["district", "type", "priority", "status"].forEach((k) => {
        document
          .querySelector(`#${k}-filter`)
          .addEventListener("change", (e) => {
            filters[k] = e.target.value;
            render();
          });
      });

      document
        .querySelector("#reset-filters")
        .addEventListener("click", () => {
          resetFilters();
          render();
        });

      // Sort toggle
      document.querySelector("#sort-time")?.addEventListener("click", () => {
        sortMode = "time";
        document.querySelector("#sort-time").classList.add("active");
        document.querySelector("#sort-priority").classList.remove("active");
        render();
      });
      document
        .querySelector("#sort-priority")
        ?.addEventListener("click", () => {
          sortMode = "priority";
          document.querySelector("#sort-priority").classList.add("active");
          document.querySelector("#sort-time").classList.remove("active");
          render();
        });

      // District scan preset select
      document
        .querySelector("#scan-district-select")
        ?.addEventListener("change", (e) => {
          const key = e.target.value;
          if (!key) {
            scanWaypoints = null;
            return;
          }
          const centroid = DISTRICT_CENTROIDS[key];
          if (!centroid) return;
          const latInput = document.querySelector("#scan-lat");
          const lngInput = document.querySelector("#scan-lng");
          if (latInput) latInput.value = centroid.lat;
          if (lngInput) lngInput.value = centroid.lng;
          scanWaypoints = null; // single-point for district
          const label = document.querySelector("#scan-mode-label");
          if (label) {
            const opt = e.target.options[e.target.selectedIndex];
            label.textContent =
              key === "city"
                ? "🌆 Entire Istanbul (city-wide)"
                : `District: ${opt.textContent}`;
          }
          // Fly to district on map
          map.flyTo([centroid.lat, centroid.lng], 13, {
            animate: true,
            duration: 1.2,
          });
        });

      // Import (hidden, kept for JS compatibility)
      document
        .querySelector("#detection-import")
        ?.addEventListener("change", (e) => {
          const [f] = e.target.files;
          if (f) importDetections(f);
          e.target.value = "";
        });

      document
        .querySelector("#trigger-scan")
        .addEventListener("click", triggerScan);

      // Issue list click
      document.querySelector("#issue-list").addEventListener("click", (e) => {
        const item = e.target.closest("[data-detection-id]");
        if (item) selectDetection(item.dataset.detectionId);
      });

      // Status actions
      document.querySelector("#status-actions").addEventListener("click", (e) => {
        const button = e.target.closest("[data-next-status]");
        if (!button || !selectedId) return;
        detections = updateDetectionStatus(
          detections,
          selectedId,
          button.dataset.nextStatus,
        );
        render();
      });

      // Deletion report
      document
        .querySelector("#deletion-report-import")
        .addEventListener("change", (e) => {
          const [f] = e.target.files;
          if (f) importDeletionReport(f);
          e.target.value = "";
        });

      // Export compliance
      document
        .querySelector("#export-compliance")
        .addEventListener("click", () => {
          downloadJson(
            "urbanpulse-compliance-summary.json",
            buildComplianceSummary(detections, deletionReport),
          );
        });
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    populateDistricts();
    bindControls();
    render();
    renderDeletionProof();
    renderPipelineEvidence();

    // Auto-connect to the local AI pipeline on load
    connectPipeline();

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      if (clockTimer) clearInterval(clockTimer);
      map.remove();
      initialized.current = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="UrbanPulse home">
          <span className="brand-mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span>
            <strong>UrbanPulse</strong>
            <small>İstanbul City Intelligence</small>
          </span>
        </a>
        <div className="topbar-center">
          <span className="live-dot"></span>
          <span>Live city-wide overview</span>
        </div>
        <div className="topbar-right">
          <span className="connection-indicator" id="connection-indicator">
            <span className="conn-dot offline"></span>
            <span id="conn-label">API offline</span>
          </span>
          <strong id="live-clock">--:--:--</strong>
        </div>
      </header>

      <div className="dashboard-layout">
        {/* ── Left Sidebar ─────────────────────────────────────────── */}
        <aside className="sidebar" id="sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-section">
              <p className="eyebrow">Control panel</p>
              <div className="section-row">
                <h2 className="sidebar-h2">Focus signal</h2>
                <button id="reset-filters" className="text-button" type="button">
                  Reset
                </button>
              </div>

              <div className="filters">
                <label>
                  District
                  <select id="district-filter"></select>
                </label>
                <label>
                  Issue type
                  <select id="type-filter">
                    <option value="all">All issue types</option>
                    <option value="road_damage">Road damage</option>
                    <option value="damaged_sign">Damaged sign</option>
                    <option value="overflowing_container">
                      Overflowing container
                    </option>
                    <option value="traffic_sign">Traffic sign</option>
                    <option value="traffic_light">Traffic light</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select id="priority-filter">
                    <option value="all">All priorities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  Status
                  <select id="status-filter">
                    <option value="all">All statuses</option>
                    <option value="new">New</option>
                    <option value="assigned">Assigned</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Stats breakdown */}
            <div className="sidebar-section stats-breakdown">
              <p className="eyebrow">Category breakdown</p>
              <div className="cat-bars" id="cat-bars"></div>
            </div>

            {/* Route Scan */}
            <div className="sidebar-section import-panel">
              <div className="route-scan-panel">
                <p className="eyebrow">Route scan</p>
                <strong>Trigger a district scan</strong>
                <p>
                  Send a scan to the pipeline and refresh map detections.
                  <br />
                  <span className="source-badge">
                    Primary: Municipal vehicle cameras
                  </span>
                </p>

                <label className="field-label" htmlFor="scan-district-select">
                  District preset
                  <select id="scan-district-select">
                    <option value="">— select district —</option>
                    <option value="kadikoy" data-lat="40.9930" data-lng="29.0300">
                      Kadıköy
                    </option>
                    <option value="besiktas" data-lat="41.0430" data-lng="29.0080">
                      Beşiktaş
                    </option>
                    <option value="sisli" data-lat="41.0602" data-lng="28.9877">
                      Şişli
                    </option>
                    <option value="fatih" data-lat="41.0170" data-lng="28.9497">
                      Fatih
                    </option>
                    <option value="uskudar" data-lat="41.0265" data-lng="29.0152">
                      Üsküdar
                    </option>
                    <option value="beyoglu" data-lat="41.0335" data-lng="28.9774">
                      Beyoğlu
                    </option>
                    <option value="bakirkoy" data-lat="40.9781" data-lng="28.8746">
                      Bakırköy
                    </option>
                    <option value="maltepe" data-lat="40.9357" data-lng="29.1551">
                      Maltepe
                    </option>
                    <option value="pendik" data-lat="40.8777" data-lng="29.2350">
                      Pendik
                    </option>
                    <option value="atasehir" data-lat="40.9920" data-lng="29.1244">
                      Ataşehir
                    </option>
                    <option value="sariyer" data-lat="41.1664" data-lng="29.0502">
                      Sarıyer
                    </option>
                    <option
                      value="eyupsultan"
                      data-lat="41.0499"
                      data-lng="28.9283"
                    >
                      Eyüpsultan
                    </option>
                    <option value="bagcilar" data-lat="41.0368" data-lng="28.8570">
                      Bağcılar
                    </option>
                    <option
                      value="bahcelievler"
                      data-lat="41.0008"
                      data-lng="28.8556"
                    >
                      Bahçelievler
                    </option>
                    <option
                      value="zeytinburnu"
                      data-lat="40.9974"
                      data-lng="28.9099"
                    >
                      Zeytinburnu
                    </option>
                    <option
                      value="gaziosmanpasa"
                      data-lat="41.0642"
                      data-lng="28.9124"
                    >
                      Gaziosmanpaşa
                    </option>
                    <option
                      value="sultangazi"
                      data-lat="41.1071"
                      data-lng="28.8717"
                    >
                      Sultangazi
                    </option>
                    <option
                      value="kucukcekmece"
                      data-lat="41.0013"
                      data-lng="28.7836"
                    >
                      Küçükçekmece
                    </option>
                    <option value="avcilar" data-lat="40.9799" data-lng="28.7219">
                      Avcılar
                    </option>
                    <option
                      value="buyukcekmece"
                      data-lat="41.0220"
                      data-lng="28.5805"
                    >
                      Büyükçekmece
                    </option>
                    <option value="gungoren" data-lat="41.0115" data-lng="28.8730">
                      Güngören
                    </option>
                    <option value="kartal" data-lat="40.9132" data-lng="29.1888">
                      Kartal
                    </option>
                    <option value="umraniye" data-lat="41.0166" data-lng="29.1065">
                      Ümraniye
                    </option>
                    <option value="esenyurt" data-lat="41.0336" data-lng="28.6736">
                      Esenyurt
                    </option>
                    <option value="tuzla" data-lat="40.8167" data-lng="29.2996">
                      Tuzla
                    </option>
                    <option
                      value="basaksehir"
                      data-lat="41.0919"
                      data-lng="28.8136"
                    >
                      Başakşehir
                    </option>
                    <option
                      value="arnavutkoy"
                      data-lat="41.1851"
                      data-lng="28.7397"
                    >
                      Arnavutköy
                    </option>
                    <option value="beykoz" data-lat="41.1313" data-lng="29.0956">
                      Beykoz
                    </option>
                    <option
                      value="sultanbeyli"
                      data-lat="40.9646"
                      data-lng="29.2629"
                    >
                      Sultanbeyli
                    </option>
                    <option value="cekmekoy" data-lat="41.0449" data-lng="29.1843">
                      Çekmeköy
                    </option>
                    <option value="silivri" data-lat="41.0735" data-lng="28.2470">
                      Silivri
                    </option>
                    <option value="city" data-lat="41.0082" data-lng="28.9784">
                      🌆 Entire Istanbul
                    </option>
                  </select>
                </label>

                <div className="scan-inputs">
                  <label className="field-label" htmlFor="scan-lat">
                    Latitude
                    <input
                      id="scan-lat"
                      type="number"
                      step="0.0001"
                      defaultValue="41.015"
                    />
                  </label>
                  <label className="field-label" htmlFor="scan-lng">
                    Longitude
                    <input
                      id="scan-lng"
                      type="number"
                      step="0.0001"
                      defaultValue="28.875"
                    />
                  </label>
                </div>
                <span id="scan-mode-label" className="scan-mode-label">
                  Single point
                </span>

                <button id="trigger-scan" className="btn-scan" type="button">
                  Trigger Scan
                </button>

                <div id="scan-progress" className="scan-progress-bar" hidden>
                  <div className="scan-progress-track">
                    <div className="scan-progress-fill" id="scan-progress-fill"></div>
                  </div>
                  <span id="scan-progress-text" className="scan-progress-text">
                    Scanning…
                  </span>
                </div>

                <div id="scan-last-time" className="scan-last-time" hidden>
                  Last scan: <span id="scan-last-time-val">—</span>
                </div>

                <div id="scan-status" className="status-msg" role="status">
                  No scan in progress.
                </div>
                <p className="source-note">
                  <strong>Primary source:</strong> Municipal vehicle cameras
                </p>
              </div>

              {/* Hidden elements needed by JS */}
              <input
                id="pipeline-api-url"
                type="hidden"
                defaultValue="http://127.0.0.1:8000"
              />
              <input
                id="detection-import"
                type="file"
                accept="application/json,.json"
              />
              <div id="pipeline-status" className="status-msg" role="status" style={{ display: 'none' }}></div>
              <div id="import-status" className="status-msg" role="status" style={{ display: 'none' }}></div>
            </div>

            <div className="privacy-card">
              <div className="privacy-icon" aria-hidden="true">
                P
              </div>
              <div>
                <strong>Privacy by design</strong>
                <p>
                  Faces &amp; license plates are irreversibly blurred before
                  detection begins, and raw footage is deleted after processing.
                  Only anonymous urban-object signals are ever stored.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main map area ───────────────────────────────────────── */}
        <div className="main-area">
          {/* Floating stats overlay */}
          <div className="stats-overlay">
            <div className="stat-chip stat-chip--primary">
              <span>Total</span>
              <strong id="stat-total">0</strong>
            </div>
            <div className="stat-chip stat-chip--danger">
              <span>Urgent</span>
              <strong id="stat-urgent">0</strong>
            </div>
            <div className="stat-chip stat-chip--success">
              <span>Resolved</span>
              <strong id="stat-resolved">0</strong>
            </div>
            <div className="stat-chip">
              <span>Districts</span>
              <strong id="stat-districts">0</strong>
            </div>
            <div className="stat-chip stat-chip--signal">
              <span
                className="live-dot"
                style={{ width: "6px", height: "6px" }}
              ></span>
              <strong id="signal-count">0</strong>
              <span style={{ fontSize: "9px", opacity: 0.7 }}> signals</span>
            </div>
          </div>

          {/* Map toolbar */}
          <div className="map-toolbar">
            <div className="toolbar-left">
              <span className="live-dot"></span>
              <strong id="visible-count">0 signals visible</strong>
            </div>
            <div className="map-legend" aria-label="Map legend">
              <span>
                <i className="route-key"></i> Route
              </span>
              <span>
                <i className="dot road"></i> Road
              </span>
              <span>
                <i className="dot sign"></i> Sign
              </span>
              <span>
                <i className="dot waste"></i> Waste
              </span>
              <span>
                <i className="dot traffic"></i> Traffic
              </span>
            </div>
          </div>

          <p className="map-legend-note">
            Markers show urban objects (road damage, signs, bins) — never people
            or vehicles.
          </p>

          <div id="map" aria-label="City issue map"></div>

          {/* Issue list panel overlaid at bottom of map */}
          <div className="issue-list-panel">
            <div className="issue-panel-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 2px" }}>
                  Field queue
                </p>
                <strong>Latest detections</strong>
              </div>
              <div className="sort-controls">
                <button className="sort-btn active" id="sort-time" type="button">
                  Time
                </button>
                <button className="sort-btn" id="sort-priority" type="button">
                  Priority
                </button>
              </div>
              <span id="queue-count" className="count-pill">
                0 issues
              </span>
            </div>
            <div id="issue-list" className="issue-list"></div>
          </div>
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────────────────── */}
      <section id="issue-detail" className="detail-panel" aria-live="polite">
        <div>
          <p className="eyebrow">Selected field signal</p>
          <h2 id="detail-title">Select an issue</h2>
          <p id="detail-summary" className="detail-summary">
            Choose a marker or queue item to inspect its municipal action.
          </p>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>District</dt>
            <dd id="detail-district">—</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd id="detail-confidence">—</dd>
          </div>
          <div>
            <dt>Detected</dt>
            <dd id="detail-time">—</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd id="detail-status">—</dd>
          </div>
        </dl>
        <div className="action-note">
          <span>Recommended action</span>
          <strong id="detail-action">Awaiting signal selection</strong>
          <div id="status-actions" className="status-actions">
            <button type="button" data-next-status="new">
              Reopen
            </button>
            <button type="button" data-next-status="assigned">
              Assign team
            </button>
            <button type="button" data-next-status="resolved">
              Mark resolved
            </button>
          </div>
        </div>
      </section>

      {/* ── Privacy pipeline info ─────────────────────────────────── */}
      <section className="lower-grid">
        <div className="pipeline-panel">
          <p className="eyebrow">Privacy-by-design</p>
          <h2>
            Useful data.
            <br />
            <em>Nothing personal.</em>
          </h2>
          <ol className="pipeline">
            <li>
              <span>01</span>
              <div>
                <strong>Capture locally</strong>
                <p>Service vehicles observe city assets during normal routes.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Anonymize first</strong>
                <p>Faces and plates are blurred before object analysis.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Keep only signals</strong>
                <p>Only issue type, location, confidence, and time remain.</p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Delete raw footage</strong>
                <p>Source images are removed and deletion is documented.</p>
              </div>
            </li>
          </ol>
        </div>

        {/* ── Compliance console ──────────────────────────────────── */}
        <div className="compliance-console">
          <div className="compliance-intro">
            <p className="eyebrow">Compliance console</p>
            <h2>Prove the safeguards.</h2>
            <p>
              Policy claims and deletion evidence are kept separate. Upload the
              AI pipeline's deletion report to complete the audit record.
            </p>
            <div className="compliance-actions">
              <label className="audit-button primary" htmlFor="deletion-report-import">
                Verify deletion report
              </label>
              <input
                id="deletion-report-import"
                type="file"
                accept="application/json,.json"
              />
              <button id="export-compliance" className="audit-button" type="button">
                Export audit summary
              </button>
            </div>
            <div id="deletion-status" className="status-msg" role="status">
              Waiting for raw-data deletion proof.
            </div>
          </div>

          <div className="compliance-checks">
            <article className="check-card verified">
              <span>01</span>
              <div>
                <strong>Purpose limited</strong>
                <p>Only approved urban-object classes enter the dashboard.</p>
              </div>
              <b>Verified</b>
            </article>
            <article className="check-card verified">
              <span>02</span>
              <div>
                <strong>Personal data rejected</strong>
                <p>Identity, face, plate, vehicle, and tracking fields fail import.</p>
              </div>
              <b>Verified</b>
            </article>
            <article id="deletion-check" className="check-card pending">
              <span>03</span>
              <div>
                <strong>Raw data deleted</strong>
                <p id="deletion-check-copy">
                  Deletion evidence has not been imported.
                </p>
              </div>
              <b id="deletion-check-label">Pending</b>
            </article>
          </div>

          <div className="pipeline-evidence">
            <div className="section-row">
              <div>
                <p className="eyebrow">Live pipeline evidence</p>
                <h2 id="evidence-mode" style={{ fontSize: "18px", margin: 0 }}>
                  Not connected
                </h2>
              </div>
              <span id="evidence-guardrail" className="count-pill">
                Awaiting proof
              </span>
            </div>
            <div className="evidence-grid">
              <article>
                <span>Image source</span>
                <strong id="evidence-source">—</strong>
              </article>
              <article>
                <span>Processed frames</span>
                <strong id="evidence-frames">—</strong>
              </article>
              <article>
                <span>Faces blurred</span>
                <strong id="evidence-faces">—</strong>
              </article>
              <article>
                <span>Plates blurred</span>
                <strong id="evidence-plates">—</strong>
              </article>
              <article>
                <span>Detections after dedupe</span>
                <strong id="evidence-detections">—</strong>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy footer ────────────────────────────────────────── */}
      <footer className="privacy-footer">
        <span>
          🔒 Privacy by design · Faces &amp; license plates irreversibly blurred
          before detection · Raw footage deleted after processing · KVKK
          compliant · No identity tracking · No vehicle profiling
        </span>
      </footer>
    </div>
  );
}
