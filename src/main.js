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
  normalizePipelineDetections,
  updateDetectionStatus,
  validateDetectionImport,
} from "./dashboard.js";
import { detections as sampleDetections } from "./data.js";

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
  traffic_sign: "#3974a8",
  traffic_light: "#7655a3",
};

const actions = {
  road_damage: "Create a road maintenance inspection task.",
  damaged_sign: "Dispatch a signage team to assess and replace.",
  overflowing_container: "Prioritize the location for waste collection.",
  traffic_sign: "Create a traffic-sign inventory verification task.",
  traffic_light: "Create a traffic-signal inspection task.",
};

const filters = {
  district: "all",
  type: "all",
  priority: "all",
  status: "all",
};

let detections = createDemoDetections(sampleDetections);
let selectedId = detections[0]?.id;
let deletionReport = null;

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
}).setView([41.02, 29.02], 10);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);

function populateDistricts() {
  const select = document.querySelector("#district-filter");
  const districts = [...new Set(detections.map(({ district }) => district))].sort();

  select.innerHTML = '<option value="all">All districts</option>';
  districts.forEach((district) => {
    select.add(new Option(district, district));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeMarker(detection) {
  const color = colors[detection.type];
  const marker = L.circleMarker([detection.latitude, detection.longitude], {
    radius: detection.id === selectedId ? 13 : detection.priority === "high" ? 10 : 8,
    color: "#fff8ed",
    weight: detection.id === selectedId ? 5 : 3,
    fillColor: color,
    fillOpacity: 1,
  });

  marker.bindPopup(`
    <div class="map-popup">
      <span>${escapeHtml(detection.id)} · ${escapeHtml(detection.district)}</span>
      <strong>${labels[detection.type]}</strong>
      <p>${Math.round(detection.confidence * 100)}% confidence · ${detection.priority} priority</p>
      <b>${detection.status}</b>
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
    L.polyline(routePoints, {
      color: "#004b46",
      weight: 3,
      opacity: 0.66,
      dashArray: "8 9",
    }).addTo(routeLayer);
  }

  items.forEach((detection) => makeMarker(detection).addTo(markerLayer));

  if (items.length) {
    const bounds = L.latLngBounds(
      items.map(({ latitude, longitude }) => [latitude, longitude]),
    );
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 12 });
  }
}

function renderStats(items) {
  const stats = calculateStats(items);
  Object.entries(stats).forEach(([key, value]) => {
    document.querySelector(`#stat-${key}`).textContent = value;
  });
  document.querySelector("#signal-count").textContent = stats.total;
}

function renderIssueList(items) {
  const list = document.querySelector("#issue-list");
  const latest = [...items]
    .sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))
    .slice(0, 6);

  if (!latest.length) {
    list.innerHTML =
      '<div class="empty-state"><strong>No matching signals</strong><p>Reset filters to return to the city-wide view.</p></div>';
    return;
  }

  list.innerHTML = latest
    .map(
      (item) => `
        <button class="issue-row ${item.id === selectedId ? "selected" : ""}" type="button" data-detection-id="${escapeHtml(item.id)}">
          <i style="--issue-color: ${colors[item.type]}"></i>
          <div>
            <span>${escapeHtml(item.id)} · ${escapeHtml(item.district)}</span>
            <strong>${labels[item.type]}</strong>
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

function renderIssueDetail(items) {
  const selected = items.find(({ id }) => id === selectedId);
  if (!selected) {
    document.querySelector("#detail-title").textContent = "No signal selected";
    document.querySelector("#detail-summary").textContent =
      "Adjust the filters to inspect a municipal action.";
    ["district", "confidence", "time", "status"].forEach((field) => {
      document.querySelector(`#detail-${field}`).textContent = "—";
    });
    document.querySelector("#detail-action").textContent =
      "Awaiting signal selection";
    document.querySelectorAll("[data-next-status]").forEach((button) => {
      button.disabled = true;
      button.classList.remove("active");
    });
    return;
  }

  document.querySelector("#detail-title").textContent = labels[selected.type];
  document.querySelector("#detail-summary").textContent =
    `${selected.id} is marked ${selected.priority} priority and is ready for municipal review.`;
  document.querySelector("#detail-district").textContent = selected.district;
  document.querySelector("#detail-confidence").textContent =
    `${Math.round(selected.confidence * 100)}%`;
  document.querySelector("#detail-time").textContent = new Intl.DateTimeFormat(
    "en-GB",
    { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" },
  ).format(new Date(selected.detectedAt));
  document.querySelector("#detail-status").textContent = selected.status;
  document.querySelector("#detail-action").textContent = actions[selected.type];
  document.querySelectorAll("[data-next-status]").forEach((button) => {
    button.disabled = button.dataset.nextStatus === selected.status;
    button.classList.toggle(
      "active",
      button.dataset.nextStatus === selected.status,
    );
  });
}

function selectDetection(id) {
  selectedId = id;
  render();
  document.querySelector("#issue-detail").scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

function render() {
  const visible = filterDetections(detections, filters);
  if (!visible.some(({ id }) => id === selectedId)) {
    selectedId = visible[0]?.id;
  }
  renderStats(visible);
  renderMap(visible);
  renderIssueList(visible);
  renderIssueDetail(visible);
  document.querySelector("#visible-count").textContent =
    `${visible.length} signal${visible.length === 1 ? "" : "s"} visible`;
  document.querySelector("#queue-count").textContent =
    `${visible.length} issue${visible.length === 1 ? "" : "s"}`;
}

function resetFilters() {
  Object.keys(filters).forEach((key) => {
    filters[key] = "all";
    document.querySelector(`#${key}-filter`).value = "all";
  });
}

function showImportStatus(message, state) {
  const status = document.querySelector("#import-status");
  status.textContent = message;
  status.dataset.state = state;
}

async function importDetections(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const isPipelineOutput =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      Object.hasOwn(parsed[0], "timestamp") &&
      !Object.hasOwn(parsed[0], "detectedAt");
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    detections = isPipelineOutput
      ? normalizePipelineDetections(parsed, { baseDate: baseDate.toISOString() })
      : [...validateDetectionImport(parsed)];
    selectedId = detections[0]?.id;
    populateDistricts();
    resetFilters();
    render();
    showImportStatus(
      `${detections.length} privacy-safe detections loaded from ${file.name}${
        isPipelineOutput ? " using the AI pipeline adapter" : ""
      }.`,
      "success",
    );
  } catch (error) {
    showImportStatus(error.message, "error");
  }
}

function downloadJson(filename, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderDeletionProof() {
  const check = document.querySelector("#deletion-check");
  const copy = document.querySelector("#deletion-check-copy");
  const label = document.querySelector("#deletion-check-label");

  check.classList.toggle("verified", Boolean(deletionReport));
  check.classList.toggle("pending", !deletionReport);
  label.textContent = deletionReport ? "Verified" : "Pending";
  copy.textContent = deletionReport
    ? `${deletionReport.deletedFileCount} raw file(s) deleted at ${new Intl.DateTimeFormat(
        "en-GB",
        { dateStyle: "medium", timeStyle: "short" },
      ).format(new Date(deletionReport.deletedAt))}.`
    : "Deletion evidence has not been imported.";
}

async function importDeletionReport(file) {
  try {
    deletionReport = normalizeDeletionReport(JSON.parse(await file.text()));
    renderDeletionProof();
    const status = document.querySelector("#deletion-status");
    status.textContent =
      `Deletion verified from ${file.name}. Sensitive file paths were discarded.`;
    status.dataset.state = "success";
  } catch (error) {
    const status = document.querySelector("#deletion-status");
    status.textContent = error.message;
    status.dataset.state = "error";
  }
}

function bindControls() {
  ["district", "type", "priority", "status"].forEach((key) => {
    document.querySelector(`#${key}-filter`).addEventListener("change", (event) => {
      filters[key] = event.target.value;
      render();
    });
  });

  document.querySelector("#reset-filters").addEventListener("click", () => {
    resetFilters();
    render();
  });

  document.querySelector("#detection-import").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importDetections(file);
    event.target.value = "";
  });

  document.querySelector("#restore-demo").addEventListener("click", () => {
    detections = createDemoDetections(sampleDetections);
    selectedId = detections[0]?.id;
    deletionReport = null;
    populateDistricts();
    resetFilters();
    render();
    renderDeletionProof();
    showImportStatus("Built-in demonstration dataset restored.", "success");
    const deletionStatus = document.querySelector("#deletion-status");
    deletionStatus.textContent = "Waiting for raw-data deletion proof.";
    deletionStatus.dataset.state = "";
  });

  document.querySelector("#issue-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-detection-id]");
    if (item) selectDetection(item.dataset.detectionId);
  });

  document.querySelector("#status-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-next-status]");
    if (!button || !selectedId) return;
    detections = updateDetectionStatus(
      detections,
      selectedId,
      button.dataset.nextStatus,
    );
    render();
  });

  document
    .querySelector("#deletion-report-import")
    .addEventListener("change", (event) => {
      const [file] = event.target.files;
      if (file) importDeletionReport(file);
      event.target.value = "";
    });

  document.querySelector("#export-compliance").addEventListener("click", () => {
    downloadJson(
      "urbanpulse-compliance-summary.json",
      buildComplianceSummary(detections, deletionReport),
    );
  });
}

populateDistricts();
bindControls();
render();
renderDeletionProof();
