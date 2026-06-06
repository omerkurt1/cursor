import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { calculateStats, filterDetections } from "./dashboard.js";
import { detections } from "./data.js";

const labels = {
  road_damage: "Road damage",
  damaged_sign: "Damaged sign",
  overflowing_container: "Overflowing container",
};

const colors = {
  road_damage: "#e14f2a",
  damaged_sign: "#f0a202",
  overflowing_container: "#007f73",
};

const filters = {
  district: "all",
  type: "all",
  priority: "all",
  status: "all",
};

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
}).setView([41.02, 29.02], 10);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

function populateDistricts() {
  const select = document.querySelector("#district-filter");
  const districts = [...new Set(detections.map(({ district }) => district))].sort();

  select.innerHTML = '<option value="all">All districts</option>';
  districts.forEach((district) => {
    select.add(new Option(district, district));
  });
}

function makeMarker(detection) {
  const color = colors[detection.type];
  const marker = L.circleMarker([detection.latitude, detection.longitude], {
    radius: detection.priority === "high" ? 10 : 8,
    color: "#fff8ed",
    weight: 3,
    fillColor: color,
    fillOpacity: 1,
  });

  marker.bindPopup(`
    <div class="map-popup">
      <span>${detection.id} · ${detection.district}</span>
      <strong>${labels[detection.type]}</strong>
      <p>${Math.round(detection.confidence * 100)}% confidence · ${detection.priority} priority</p>
      <b>${detection.status}</b>
    </div>
  `);

  return marker;
}

function renderMap(items) {
  markerLayer.clearLayers();
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
        <article class="issue-row">
          <i style="--issue-color: ${colors[item.type]}"></i>
          <div>
            <span>${item.id} · ${item.district}</span>
            <strong>${labels[item.type]}</strong>
          </div>
          <div class="issue-meta">
            <span class="priority ${item.priority}">${item.priority}</span>
            <small>${item.status}</small>
          </div>
        </article>
      `,
    )
    .join("");
}

function render() {
  const visible = filterDetections(detections, filters);
  renderStats(visible);
  renderMap(visible);
  renderIssueList(visible);
  document.querySelector("#visible-count").textContent =
    `${visible.length} signal${visible.length === 1 ? "" : "s"} visible`;
  document.querySelector("#queue-count").textContent =
    `${visible.length} issue${visible.length === 1 ? "" : "s"}`;
}

function bindControls() {
  ["district", "type", "priority", "status"].forEach((key) => {
    document.querySelector(`#${key}-filter`).addEventListener("change", (event) => {
      filters[key] = event.target.value;
      render();
    });
  });

  document.querySelector("#reset-filters").addEventListener("click", () => {
    Object.keys(filters).forEach((key) => {
      filters[key] = "all";
      document.querySelector(`#${key}-filter`).value = "all";
    });
    render();
  });
}

populateDistricts();
bindControls();
render();
