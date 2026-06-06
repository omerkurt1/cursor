import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
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
} from "./dashboard.js";
import { detections as sampleDetections } from "./data.js";

// ── Label / colour / action maps ─────────────────────────────────────────────
const labels = {
  road_damage:          "Road damage",
  damaged_sign:         "Damaged sign",
  overflowing_container:"Overflowing container",
  traffic_sign:         "Traffic sign",
  traffic_light:        "Traffic light",
};

const colors = {
  road_damage:          "#ff4757",
  damaged_sign:         "#ffa502",
  overflowing_container:"#00d4aa",
  traffic_sign:         "#4e9cf5",
  traffic_light:        "#a55eea",
};

const actions = {
  road_damage:           "Create a road maintenance inspection task.",
  damaged_sign:          "Dispatch a signage team to assess and replace.",
  overflowing_container: "Prioritize the location for waste collection.",
  traffic_sign:          "Create a traffic-sign inventory verification task.",
  traffic_light:         "Create a traffic-signal inspection task.",
};

// ── District centroids for scan presets ──────────────────────────────────────
const DISTRICT_CENTROIDS = {
  kadikoy:       { lat: 40.9930, lng: 29.0300 },
  besiktas:      { lat: 41.0430, lng: 29.0080 },
  sisli:         { lat: 41.0602, lng: 28.9877 },
  fatih:         { lat: 41.0170, lng: 28.9497 },
  uskudar:       { lat: 41.0265, lng: 29.0152 },
  beyoglu:       { lat: 41.0335, lng: 28.9774 },
  bakirkoy:      { lat: 40.9781, lng: 28.8746 },
  maltepe:       { lat: 40.9357, lng: 29.1551 },
  pendik:        { lat: 40.8777, lng: 29.2350 },
  atasehir:      { lat: 40.9920, lng: 29.1244 },
  sariyer:       { lat: 41.1664, lng: 29.0502 },
  eyupsultan:    { lat: 41.0499, lng: 28.9283 },
  bagcilar:      { lat: 41.0368, lng: 28.8570 },
  bahcelievler:  { lat: 41.0008, lng: 28.8556 },
  zeytinburnu:   { lat: 40.9974, lng: 28.9099 },
  gaziosmanpasa: { lat: 41.0642, lng: 28.9124 },
  sultangazi:    { lat: 41.1071, lng: 28.8717 },
  kucukcekmece:  { lat: 41.0013, lng: 28.7836 },
  avcilar:       { lat: 40.9799, lng: 28.7219 },
  buyukcekmece:  { lat: 41.0220, lng: 28.5805 },
  gungoren:      { lat: 41.0115, lng: 28.8730 },
  kartal:        { lat: 40.9132, lng: 29.1888 },
  umraniye:      { lat: 41.0166, lng: 29.1065 },
  esenyurt:      { lat: 41.0336, lng: 28.6736 },
  tuzla:         { lat: 40.8167, lng: 29.2996 },
  basaksehir:    { lat: 41.0919, lng: 28.8136 },
  arnavutkoy:    { lat: 41.1851, lng: 28.7397 },
  beykoz:        { lat: 41.1313, lng: 29.0956 },
  sultanbeyli:   { lat: 40.9646, lng: 29.2629 },
  cekmekoy:      { lat: 41.0449, lng: 29.1843 },
  silivri:       { lat: 41.0735, lng: 28.2470 },
  city:          { lat: 41.0082, lng: 28.9784 },
};

// ── App state ─────────────────────────────────────────────────────────────────
const filters = { district: "all", type: "all", priority: "all", status: "all" };
let detections   = createDemoDetections(sampleDetections);
let selectedId   = detections[0]?.id;
let deletionReport  = null;
let pipelineReport  = null;
let scanWaypoints   = null;
let sortMode        = "time"; // "time" | "priority"

// ── Map setup ─────────────────────────────────────────────────────────────────
const map = L.map("map", { zoomControl: false, attributionControl: true })
  .setView([41.0082, 28.9784], 10);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Dark CartoDB tiles
L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  },
).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const routeLayer  = L.layerGroup().addTo(map);

// ── Live clock ────────────────────────────────────────────────────────────────
function startClock() {
  const el = document.querySelector("#live-clock");
  function tick() {
    el.textContent = new Date().toLocaleTimeString("tr-TR", { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}
startClock();

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Districts dropdown ────────────────────────────────────────────────────────
function populateDistricts() {
  const select = document.querySelector("#district-filter");
  const districts = [...new Set(detections.map(({ district }) => district))].sort();
  select.innerHTML = '<option value="all">All districts</option>';
  districts.forEach((d) => select.add(new Option(d, d)));
}

// ── Category bars ─────────────────────────────────────────────────────────────
function renderCategoryBars(items) {
  const container = document.querySelector("#cat-bars");
  const typeCounts = {};
  items.forEach(({ type }) => { typeCounts[type] = (typeCounts[type] || 0) + 1; });
  const max = Math.max(1, ...Object.values(typeCounts));

  const entries = [
    ["road_damage",          "Road damage"],
    ["damaged_sign",         "Dmg sign"],
    ["overflowing_container","Overflow"],
    ["traffic_sign",         "Tfc sign"],
    ["traffic_light",        "Tfc light"],
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

// ── Map markers ───────────────────────────────────────────────────────────────
function makeMarker(detection) {
  const isSelected = detection.id === selectedId;
  const isHigh     = detection.priority === "high";
  const color      = colors[detection.type];

  const marker = L.circleMarker([detection.latitude, detection.longitude], {
    radius:      isSelected ? 13 : isHigh ? 10 : 8,
    color:       isSelected ? "#ffffff" : "rgba(255,255,255,.45)",
    weight:      isSelected ? 3 : 2,
    fillColor:   color,
    fillOpacity: 1,
    className:   isHigh ? "high-priority-ring" : "",
  });

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

  const routePoints = getRoutePoints(items);
  if (routePoints.length > 1) {
    L.polyline(routePoints, { color: "#00d4aa", weight: 2, opacity: .5, dashArray: "6 8" })
      .addTo(routeLayer);
  }

  items.forEach((d) => makeMarker(d).addTo(markerLayer));

  if (items.length) {
    const bounds = L.latLngBounds(items.map(({ latitude, longitude }) => [latitude, longitude]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) { el.textContent = target; return; }
  const steps = 16;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(start + (target - start) * (step / steps));
    if (step >= steps) { clearInterval(timer); el.textContent = target; }
  }, 20);
}

function renderStats(items) {
  const stats = calculateStats(items);
  ["total","urgent","resolved","districts"].forEach((k) => {
    const el = document.querySelector(`#stat-${k}`);
    if (el) animateNumber(el, stats[k]);
  });
  const sc = document.querySelector("#signal-count");
  if (sc) animateNumber(sc, stats.total);
}

// ── Issue list ────────────────────────────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function renderIssueList(items) {
  const list = document.querySelector("#issue-list");

  const sorted = [...items].sort((a, b) => {
    if (sortMode === "priority") {
      return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) ||
             (new Date(b.detectedAt) - new Date(a.detectedAt));
    }
    return new Date(b.detectedAt) - new Date(a.detectedAt);
  }).slice(0, 10);

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state"><strong>No matching signals</strong><p>Reset filters to return to the city-wide view.</p></div>';
    return;
  }

  list.innerHTML = sorted.map((item) => `
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
  `).join("");
}

// ── Issue detail ──────────────────────────────────────────────────────────────
function renderIssueDetail(items) {
  const selected = items.find(({ id }) => id === selectedId);
  if (!selected) {
    document.querySelector("#detail-title").textContent = "No signal selected";
    document.querySelector("#detail-summary").textContent = "Adjust filters to inspect a municipal action.";
    ["district","confidence","time","status"].forEach((f) => {
      document.querySelector(`#detail-${f}`).textContent = "—";
    });
    document.querySelector("#detail-action").textContent = "Awaiting signal selection";
    document.querySelectorAll("[data-next-status]").forEach((b) => { b.disabled = true; b.classList.remove("active"); });
    return;
  }

  document.querySelector("#detail-title").textContent = labels[selected.type];
  document.querySelector("#detail-summary").textContent =
    `${selected.id} is marked ${selected.priority} priority and is ready for municipal review.`;
  document.querySelector("#detail-district").textContent = selected.district;
  document.querySelector("#detail-confidence").textContent = `${Math.round(selected.confidence * 100)}%`;
  document.querySelector("#detail-time").textContent = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
  }).format(new Date(selected.detectedAt));
  document.querySelector("#detail-status").textContent = selected.status;
  document.querySelector("#detail-action").textContent = actions[selected.type];
  document.querySelectorAll("[data-next-status]").forEach((b) => {
    b.disabled = b.dataset.nextStatus === selected.status;
    b.classList.toggle("active", b.dataset.nextStatus === selected.status);
  });
}

// ── Select detection ──────────────────────────────────────────────────────────
function selectDetection(id) {
  selectedId = id;
  render();
}

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
  const visible = filterDetections(detections, filters);
  if (!visible.some(({ id }) => id === selectedId)) selectedId = visible[0]?.id;
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

// ── Import status ─────────────────────────────────────────────────────────────
function showImportStatus(message, state) {
  const s = document.querySelector("#import-status");
  s.textContent = message; s.dataset.state = state;
}

async function importDetections(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const isPipeline =
      Array.isArray(parsed) && parsed.length > 0 &&
      Object.hasOwn(parsed[0], "timestamp") && !Object.hasOwn(parsed[0], "detectedAt");
    const baseDate = new Date(); baseDate.setHours(0,0,0,0);
    detections = isPipeline
      ? normalizePipelineDetections(parsed, { baseDate: baseDate.toISOString() })
      : [...validateDetectionImport(parsed)];
    selectedId = detections[0]?.id;
    populateDistricts(); resetFilters(); render();
    showImportStatus(
      `${detections.length} privacy-safe detections loaded from ${file.name}${isPipeline ? " (AI pipeline adapter)" : ""}.`,
      "success",
    );
  } catch (err) { showImportStatus(err.message, "error"); }
}

// ── Download JSON ─────────────────────────────────────────────────────────────
function downloadJson(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Deletion proof ────────────────────────────────────────────────────────────
function renderDeletionProof() {
  const check = document.querySelector("#deletion-check");
  const copy  = document.querySelector("#deletion-check-copy");
  const label = document.querySelector("#deletion-check-label");
  check.classList.toggle("verified", Boolean(deletionReport));
  check.classList.toggle("pending",  !deletionReport);
  label.textContent = deletionReport ? "Verified" : "Pending";
  copy.textContent  = deletionReport
    ? `${deletionReport.deletedFileCount} raw file(s) deleted at ${new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(deletionReport.deletedAt))}.`
    : "Deletion evidence has not been imported.";
}

// ── Pipeline evidence ─────────────────────────────────────────────────────────
function renderPipelineEvidence() {
  document.querySelector("#evidence-mode").textContent = pipelineReport
    ? (pipelineReport.mode === "real_model" ? "Real model output" : "Clearly labeled demo fallback")
    : "Not connected";
  document.querySelector("#evidence-guardrail").textContent = pipelineReport ? "Guardrails verified" : "Awaiting proof";
  document.querySelector("#evidence-source").textContent = pipelineReport
    ? (pipelineReport.source === "google_street_view" ? "Dev fallback — Street View" : "Municipal vehicle cameras")
    : "—";
  document.querySelector("#evidence-frames").textContent     = pipelineReport?.processedFrames ?? "—";
  document.querySelector("#evidence-faces").textContent      = pipelineReport?.blurredFaces    ?? "—";
  document.querySelector("#evidence-plates").textContent     = pipelineReport?.blurredLicensePlates ?? "—";
  document.querySelector("#evidence-detections").textContent = pipelineReport
    ? `${pipelineReport.dedupedDetectionCount} / ${pipelineReport.rawDetectionCount}` : "—";
}

// ── Connection indicator ──────────────────────────────────────────────────────
function setConnectionStatus(online) {
  const dot   = document.querySelector(".conn-dot");
  const label = document.querySelector("#conn-label");
  if (!dot || !label) return;
  dot.classList.toggle("online",  online);
  dot.classList.toggle("offline", !online);
  label.textContent = online ? "API connected" : "API offline";
}

// ── Import deletion report ────────────────────────────────────────────────────
async function importDeletionReport(file) {
  try {
    deletionReport = normalizeDeletionReport(JSON.parse(await file.text()));
    renderDeletionProof();
    const s = document.querySelector("#deletion-status");
    s.textContent = `Deletion verified from ${file.name}. Sensitive file paths discarded.`;
    s.dataset.state = "success";
  } catch (err) {
    const s = document.querySelector("#deletion-status");
    s.textContent = err.message; s.dataset.state = "error";
  }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchJson(url, label) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${label} request failed (${res.status}).`);
  }
  return res.json();
}

// ── Connect pipeline ──────────────────────────────────────────────────────────
async function connectPipeline() {
  const statusEl = document.querySelector("#pipeline-status");
  const button   = document.querySelector("#connect-pipeline");
  button.disabled = true;
  statusEl.textContent = "Connecting to local AI pipeline…"; statusEl.dataset.state = "";

  try {
    const baseUrl = normalizeLocalApiUrl(document.querySelector("#pipeline-api-url").value);
    const health  = await fetchJson(`${baseUrl}/health`, "Health");
    if (health.status !== "ok" || health.service !== "ai-privacy-pipeline") {
      throw new Error("Connected service is not the expected AI privacy pipeline.");
    }

    pipelineReport = normalizePipelineReport(
      await fetchJson(`${baseUrl}/api/pipeline-report`, "Pipeline report"),
    );
    detections = normalizePipelineDetections(
      await fetchJson(`${baseUrl}/api/detections`, "Detections"),
    );
    selectedId = detections[0]?.id;
    populateDistricts(); resetFilters(); render(); renderPipelineEvidence();
    setConnectionStatus(true);

    try {
      deletionReport = normalizeDeletionReport(
        await fetchJson(`${baseUrl}/api/deletion-report`, "Deletion report"),
      );
      renderDeletionProof();
    } catch { deletionReport = null; renderDeletionProof(); }

    statusEl.textContent = `${detections.length} live detection(s) loaded.`;
    statusEl.dataset.state = "success";
  } catch (err) {
    pipelineReport = null; renderPipelineEvidence(); setConnectionStatus(false);
    statusEl.textContent = err.message; statusEl.dataset.state = "error";
  } finally { button.disabled = false; }
}

// ── Poll scan status ──────────────────────────────────────────────────────────
async function pollScanStatus(baseUrl, statusEl) {
  const fillEl = document.querySelector("#scan-progress-fill");
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const data = await fetchJson(`${baseUrl}/api/scan/status`, "Scan status");
      if (!data.scan_running) return data.last_result ?? {};
      const pct = Math.min(90, Math.round((i + 1) / 30 * 100));
      if (fillEl) fillEl.style.width = `${pct}%`;
      statusEl.textContent = `Scanning… (${(i + 1) * 2}s elapsed)`;
    } catch { /* keep polling */ }
  }
  throw new Error("Scan timed out after 60 seconds.");
}

// ── Trigger scan ──────────────────────────────────────────────────────────────
async function triggerScan() {
  const statusEl   = document.querySelector("#scan-status");
  const progressEl = document.querySelector("#scan-progress");
  const fillEl     = document.querySelector("#scan-progress-fill");
  const lastTimeEl = document.querySelector("#scan-last-time");
  const lastTimeVal= document.querySelector("#scan-last-time-val");
  const button     = document.querySelector("#trigger-scan");
  const demoFallback = document.querySelector("#scan-demo-fallback")?.checked ?? true;

  button.disabled = true;
  statusEl.textContent = "Sending scan request…"; statusEl.dataset.state = "";
  progressEl?.removeAttribute("hidden");
  if (fillEl) { fillEl.style.width = "10%"; fillEl.style.animation = "none"; }

  let baseUrl;
  try {
    baseUrl = normalizeLocalApiUrl(document.querySelector("#pipeline-api-url").value);
  } catch (err) {
    statusEl.textContent = err.message; statusEl.dataset.state = "error";
    progressEl?.setAttribute("hidden", "");
    button.disabled = false;
    return;
  }

  try {
    let body;
    if (scanWaypoints) {
      body = { waypoints: scanWaypoints, demo_fallback: demoFallback };
    } else {
      const lat = parseFloat(document.querySelector("#scan-lat")?.value ?? "41.015");
      const lng = parseFloat(document.querySelector("#scan-lng")?.value ?? "28.875");
      if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error("Latitude and longitude must be valid numbers.");
      body = { lat, lng, demo_fallback: demoFallback };
    }

    const scanRes = await fetch(`${baseUrl}/api/scan`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });

    if (scanRes.status === 409) throw new Error("A scan is already running. Please wait and try again.");
    if (!scanRes.ok) {
      const errBody = await scanRes.json().catch(() => ({}));
      throw new Error(errBody.error || `Scan request failed (${scanRes.status}).`);
    }

    if (scanRes.status === 202) {
      statusEl.textContent = "Scan started — waiting for results…";
      await pollScanStatus(baseUrl, statusEl);
    }

    if (fillEl) { fillEl.style.width = "100%"; fillEl.style.animation = "none"; }

    detections = normalizePipelineDetections(await fetchJson(`${baseUrl}/api/detections`, "Detections"));
    selectedId = detections[0]?.id;

    try {
      pipelineReport = normalizePipelineReport(
        await fetchJson(`${baseUrl}/api/pipeline-report`, "Pipeline report"),
      );
    } catch { pipelineReport = null; }

    populateDistricts(); resetFilters(); render(); renderPipelineEvidence();
    setConnectionStatus(true);

    const now = new Date().toLocaleTimeString("tr-TR", { hour12: false, hour: "2-digit", minute: "2-digit" });
    if (lastTimeVal) lastTimeVal.textContent = now;
    lastTimeEl?.removeAttribute("hidden");

    statusEl.textContent = `Scan complete — ${detections.length} detection(s) refreshed.`;
    statusEl.dataset.state = "success";
  } catch (err) {
    if (!err.message.includes("already running")) {
      pipelineReport = null; renderPipelineEvidence();
      detections = createDemoDetections(sampleDetections);
      selectedId = detections[0]?.id;
      populateDistricts(); resetFilters(); render();
    }
    statusEl.textContent = err.message.includes("fetch") ? "API offline — showing demo data" : err.message;
    statusEl.dataset.state = "error";
  } finally {
    button.disabled = false;
    progressEl?.setAttribute("hidden", "");
    if (fillEl) fillEl.style.animation = "";
  }
}

// ── Bind all controls ─────────────────────────────────────────────────────────
function bindControls() {
  // Filters
  ["district","type","priority","status"].forEach((k) => {
    document.querySelector(`#${k}-filter`).addEventListener("change", (e) => {
      filters[k] = e.target.value; render();
    });
  });

  document.querySelector("#reset-filters").addEventListener("click", () => { resetFilters(); render(); });

  // Sort toggle
  document.querySelector("#sort-time")?.addEventListener("click", () => {
    sortMode = "time";
    document.querySelector("#sort-time").classList.add("active");
    document.querySelector("#sort-priority").classList.remove("active");
    render();
  });
  document.querySelector("#sort-priority")?.addEventListener("click", () => {
    sortMode = "priority";
    document.querySelector("#sort-priority").classList.add("active");
    document.querySelector("#sort-time").classList.remove("active");
    render();
  });

  // District scan preset select
  document.querySelector("#scan-district-select")?.addEventListener("change", (e) => {
    const key = e.target.value;
    if (!key) { scanWaypoints = null; return; }
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
      label.textContent = key === "city"
        ? "🌆 Entire Istanbul (city-wide)"
        : `District: ${opt.textContent}`;
    }
    // Fly to district on map
    map.flyTo([centroid.lat, centroid.lng], 13, { animate: true, duration: 1.2 });
  });

  // Import
  document.querySelector("#detection-import").addEventListener("change", (e) => {
    const [f] = e.target.files; if (f) importDetections(f); e.target.value = "";
  });

  document.querySelector("#restore-demo").addEventListener("click", () => {
    detections = createDemoDetections(sampleDetections);
    selectedId = detections[0]?.id;
    deletionReport = null; pipelineReport = null;
    populateDistricts(); resetFilters(); render(); renderDeletionProof(); renderPipelineEvidence();
    showImportStatus("Built-in demonstration dataset restored.", "success");
    setConnectionStatus(false);
    document.querySelector("#deletion-status").textContent = "Waiting for raw-data deletion proof.";
    document.querySelector("#deletion-status").dataset.state = "";
    document.querySelector("#pipeline-status").textContent = "Live pipeline not connected.";
    document.querySelector("#pipeline-status").dataset.state = "";
  });

  document.querySelector("#connect-pipeline").addEventListener("click", connectPipeline);
  document.querySelector("#trigger-scan").addEventListener("click", triggerScan);

  // Issue list click
  document.querySelector("#issue-list").addEventListener("click", (e) => {
    const item = e.target.closest("[data-detection-id]");
    if (item) selectDetection(item.dataset.detectionId);
  });

  // Status actions
  document.querySelector("#status-actions").addEventListener("click", (e) => {
    const button = e.target.closest("[data-next-status]");
    if (!button || !selectedId) return;
    detections = updateDetectionStatus(detections, selectedId, button.dataset.nextStatus);
    render();
  });

  // Deletion report
  document.querySelector("#deletion-report-import").addEventListener("change", (e) => {
    const [f] = e.target.files; if (f) importDeletionReport(f); e.target.value = "";
  });

  // Export compliance
  document.querySelector("#export-compliance").addEventListener("click", () => {
    downloadJson("urbanpulse-compliance-summary.json", buildComplianceSummary(detections, deletionReport));
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
populateDistricts();
bindControls();
render();
renderDeletionProof();
renderPipelineEvidence();
