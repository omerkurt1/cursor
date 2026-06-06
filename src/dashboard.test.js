import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  calculateStats,
  filterDetections,
  getRoutePoints,
  buildComplianceSummary,
  createDemoDetections,
  normalizePipelineDetections,
  normalizeLocalApiUrl,
  normalizePipelineReport,
  normalizeDeletionReport,
  updateDetectionStatus,
  validateDetectionImport,
} from "./dashboard.js";
import { detections as sampleDetections } from "./data.js";

describe("Dashboard JSX integration", () => {
  it("does not reference the removed pipeline evidence panel", () => {
    const dashboardSource = readFileSync(
      new URL("../components/Dashboard.jsx", import.meta.url),
      "utf8",
    );

    expect(dashboardSource).not.toMatch(/#evidence-/);
  });

  it("gives every stats card the same default and hover behavior", () => {
    const dashboardSource = readFileSync(
      new URL("../components/Dashboard.jsx", import.meta.url),
      "utf8",
    );
    const stylesheetSource = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(dashboardSource).not.toContain("stat-card--primary");
    expect(stylesheetSource).not.toContain(".stat-card--primary");
  });
});

const detections = [
  {
    id: "DET-001",
    district: "Kadikoy",
    type: "road_damage",
    priority: "high",
    status: "new",
  },
  {
    id: "DET-002",
    district: "Besiktas",
    type: "damaged_sign",
    priority: "medium",
    status: "resolved",
  },
  {
    id: "DET-003",
    district: "Kadikoy",
    type: "overflowing_container",
    priority: "high",
    status: "assigned",
  },
];

describe("filterDetections", () => {
  it("returns only detections matching every selected filter", () => {
    expect(
      filterDetections(detections, {
        district: "Kadikoy",
        type: "overflowing_container",
        priority: "high",
        status: "assigned",
      }),
    ).toEqual([detections[2]]);
  });

  it("treats all as an unfiltered value", () => {
    expect(
      filterDetections(detections, {
        district: "all",
        type: "all",
        priority: "all",
        status: "all",
      }),
    ).toEqual(detections);
  });

  it("returns empty array when no detections match", () => {
    expect(
      filterDetections(detections, {
        district: "Fatih",
        type: "all",
        priority: "all",
        status: "all",
      }),
    ).toEqual([]);
  });
});

describe("calculateStats", () => {
  it("calculates operational dashboard statistics", () => {
    expect(calculateStats(detections)).toEqual({
      total: 3,
      urgent: 2,
      resolved: 1,
      districts: 2,
    });
  });

  it("returns zeros for empty dataset", () => {
    expect(calculateStats([])).toEqual({
      total: 0,
      urgent: 0,
      resolved: 0,
      districts: 0,
    });
  });
});

describe("validateDetectionImport", () => {
  const validDetection = {
    id: "DET-100",
    district: "Kadikoy",
    type: "road_damage",
    latitude: 40.9903,
    longitude: 29.0284,
    confidence: 0.94,
    priority: "high",
    status: "new",
    detectedAt: "2026-06-06T10:30:00+03:00",
  };

  it("accepts a valid minimal detection dataset", () => {
    expect(validateDetectionImport([validDetection])).toEqual([validDetection]);
  });

  it("rejects forbidden personal or tracking data fields", () => {
    expect(() =>
      validateDetectionImport([{ ...validDetection, plate: "34 ABC 123" }]),
    ).toThrow(/forbidden field "plate"/i);
  });

  it("rejects unknown fields to enforce data minimization", () => {
    expect(() =>
      validateDetectionImport([{ ...validDetection, cameraImage: "frame.jpg" }]),
    ).toThrow(/unexpected field "cameraImage"/i);
  });

  it("rejects malformed detection values", () => {
    expect(() =>
      validateDetectionImport([{ ...validDetection, latitude: 140 }]),
    ).toThrow(/latitude/i);
  });

  it("rejects confidence outside 0-1 range", () => {
    expect(() =>
      validateDetectionImport([{ ...validDetection, confidence: 1.5 }]),
    ).toThrow(/confidence/i);
  });

  it("rejects invalid type values", () => {
    expect(() =>
      validateDetectionImport([{ ...validDetection, type: "pothole" }]),
    ).toThrow(/type/i);
  });
});

describe("getRoutePoints", () => {
  it("builds a chronological route from detection coordinates", () => {
    const route = getRoutePoints([
      {
        latitude: 41.02,
        longitude: 29.02,
        detectedAt: "2026-06-06T10:02:00+03:00",
      },
      {
        latitude: 41.01,
        longitude: 29.01,
        detectedAt: "2026-06-06T10:01:00+03:00",
      },
    ]);

    expect(route).toEqual([
      [41.01, 29.01],
      [41.02, 29.02],
    ]);
  });

  it("returns empty array for no detections", () => {
    expect(getRoutePoints([])).toEqual([]);
  });
});

describe("updateDetectionStatus", () => {
  it("updates only the selected detection without mutating the input", () => {
    const updated = updateDetectionStatus(detections, "DET-001", "resolved");

    expect(updated[0].status).toBe("resolved");
    expect(updated[1]).toBe(detections[1]);
    expect(detections[0].status).toBe("new");
  });

  it("rejects unsupported municipal statuses", () => {
    expect(() =>
      updateDetectionStatus(detections, "DET-001", "deleted"),
    ).toThrow(/unsupported status/i);
  });
});

describe("normalizeDeletionReport", () => {
  it("keeps only deletion proof required for compliance", () => {
    expect(
      normalizeDeletionReport({
        deleted_at: "2026-06-06T08:30:00Z",
        raw_dir: "C:/private/raw",
        deleted_file_count: 4,
        deleted_files: ["C:/private/raw/video.mp4"],
        status: "raw_data_deleted",
      }),
    ).toEqual({
      deletedAt: "2026-06-06T08:30:00.000Z",
      deletedFileCount: 4,
      status: "raw_data_deleted",
    });
  });

  it("rejects reports that do not prove raw data deletion", () => {
    expect(() =>
      normalizeDeletionReport({
        deleted_at: "2026-06-06T08:30:00Z",
        deleted_file_count: 0,
        status: "pending",
      }),
    ).toThrow(/raw_data_deleted/i);
  });
});

describe("buildComplianceSummary", () => {
  it("creates a minimized audit summary without detection records", () => {
    expect(
      buildComplianceSummary(detections, {
        deletedAt: "2026-06-06T08:30:00.000Z",
        deletedFileCount: 4,
        status: "raw_data_deleted",
      }),
    ).toMatchObject({
      status: "ready",
      detectionCount: 3,
      personalDataFieldsAccepted: false,
      rawDataDeletion: {
        verified: true,
        deletedFileCount: 4,
      },
    });
  });

  it("returns pending status when no deletion report provided", () => {
    expect(buildComplianceSummary(detections, null)).toMatchObject({
      status: "pending_deletion_proof",
      rawDataDeletion: { verified: false },
    });
  });
});

describe("createDemoDetections", () => {
  it("creates a fresh copy so demo actions never mutate sample data", () => {
    const demo = createDemoDetections(detections);

    demo[0].status = "resolved";

    expect(demo).toEqual([
      { ...detections[0], status: "resolved" },
      detections[1],
      detections[2],
    ]);
    expect(detections[0].status).toBe("new");
  });
});

describe("normalizePipelineDetections", () => {
  it("converts minimized AI pipeline output into dashboard records", () => {
    expect(
      normalizePipelineDetections(
        [
          {
            type: "traffic_sign",
            latitude: 41.021,
            longitude: 28.874,
            confidence: 0.91,
            timestamp: "00:01:24",
          },
        ],
        { district: "Unassigned", baseDate: "2026-06-06T00:00:00Z" },
      ),
    ).toEqual([
      {
        id: "AI-001",
        district: "Unassigned",
        type: "traffic_sign",
        latitude: 41.021,
        longitude: 28.874,
        confidence: 0.91,
        priority: "high",
        status: "new",
        detectedAt: "2026-06-06T00:01:24.000Z",
      },
    ]);
  });

  it("rejects extra pipeline fields before adapting", () => {
    expect(() =>
      normalizePipelineDetections([
        {
          type: "traffic_sign",
          latitude: 41.021,
          longitude: 28.874,
          confidence: 0.91,
          timestamp: "00:01:24",
          plate: "34 ABC 123",
        },
      ]),
    ).toThrow(/unexpected field "plate"/i);
  });

  it("maps pipeline potholes into the dashboard road-damage workflow", () => {
    expect(
      normalizePipelineDetections([
        {
          type: "pothole",
          latitude: 41.021,
          longitude: 28.874,
          confidence: 0.91,
          timestamp: "00:01:24",
        },
      ])[0].type,
    ).toBe("road_damage");
  });

  it("rejects object types outside the pipeline contract", () => {
    expect(() =>
      normalizePipelineDetections([
        {
          type: "person",
          latitude: 41.021,
          longitude: 28.874,
          confidence: 0.91,
          timestamp: "00:01:24",
        },
      ]),
    ).toThrow(/unsupported pipeline type/i);
  });

  it("assigns low priority for confidence below 0.75", () => {
    const result = normalizePipelineDetections([
      {
        type: "damaged_sign",
        latitude: 41.021,
        longitude: 28.874,
        confidence: 0.6,
        timestamp: "00:01:00",
      },
    ]);
    expect(result[0].priority).toBe("low");
  });

  it("assigns medium priority for confidence between 0.75 and 0.9", () => {
    const result = normalizePipelineDetections([
      {
        type: "damaged_sign",
        latitude: 41.021,
        longitude: 28.874,
        confidence: 0.82,
        timestamp: "00:01:00",
      },
    ]);
    expect(result[0].priority).toBe("medium");
  });
});

describe("normalizeLocalApiUrl", () => {
  it("accepts local pipeline API addresses", () => {
    expect(normalizeLocalApiUrl("http://localhost:8000/")).toBe(
      "http://localhost:8000",
    );
    expect(normalizeLocalApiUrl("http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("rejects remote or insecurely specified pipeline hosts", () => {
    expect(() => normalizeLocalApiUrl("https://example.com")).toThrow(
      /local machine/i,
    );
    expect(() => normalizeLocalApiUrl("not-a-url")).toThrow(/valid URL/i);
  });

  it("blocks route-scan requests to non-local hosts", () => {
    expect(() =>
      normalizeLocalApiUrl("http://api.example.com/api/scan"),
    ).toThrow(/local machine/i);
    expect(() =>
      normalizeLocalApiUrl("http://192.168.1.1:8000"),
    ).toThrow(/local machine/i);
  });

  it("blocks https even for localhost (scan calls must use plain HTTP)", () => {
    expect(() =>
      normalizeLocalApiUrl("https://localhost:8000"),
    ).toThrow(/local machine/i);
  });
});

describe("normalizePipelineReport", () => {
  it("keeps only useful pipeline evidence and discards paths", () => {
    expect(
      normalizePipelineReport({
        input_video: "C:/private/raw.mp4",
        source: "google_street_view",
        demo_fallback_used: false,
        raw_detection_count: 8,
        deduped_detection_count: 5,
        anonymization: {
          processed_frames: 240,
          blurred_faces: 3,
          blurred_license_plates: 7,
          input: "C:/private/raw.mp4",
        },
        privacy_guardrails: {
          runs_detection_after_anonymization: true,
          anonymization_succeeded: true,
          stores_raw_frames: false,
          json_contains_identity_data: false,
        },
      }),
    ).toEqual({
      mode: "real_model",
      source: "google_street_view",
      rawDetectionCount: 8,
      dedupedDetectionCount: 5,
      processedFrames: 240,
      blurredFaces: 3,
      blurredLicensePlates: 7,
      guardrailsVerified: true,
    });
  });

  it("defaults older pipeline reports to municipal vehicle camera source", () => {
    expect(
      normalizePipelineReport({
        demo_fallback_used: true,
        raw_detection_count: 1,
        deduped_detection_count: 1,
        anonymization: {
          processed_frames: 10,
          blurred_faces: 0,
          blurred_license_plates: 0,
        },
        privacy_guardrails: {
          runs_detection_after_anonymization: true,
          stores_raw_frames: false,
          json_contains_identity_data: false,
        },
      }).source,
    ).toBe("vehicle_camera");
  });

  it("rejects reports without verified privacy guardrails", () => {
    expect(() =>
      normalizePipelineReport({
        demo_fallback_used: true,
        raw_detection_count: 1,
        deduped_detection_count: 1,
        anonymization: {
          processed_frames: 10,
          blurred_faces: 0,
          blurred_license_plates: 0,
        },
        privacy_guardrails: {
          runs_detection_after_anonymization: false,
          stores_raw_frames: false,
          json_contains_identity_data: false,
        },
      }),
    ).toThrow(/privacy guardrails/i);
  });
});

// ── City-wide data tests ──────────────────────────────────────────────────────
describe("city-wide Istanbul data", () => {
  it("sample dataset has at least 60 detections", () => {
    expect(sampleDetections.length).toBeGreaterThanOrEqual(60);
  });

  it("sample dataset covers at least 20 different districts", () => {
    const districts = new Set(sampleDetections.map((d) => d.district));
    expect(districts.size).toBeGreaterThanOrEqual(20);
  });

  it("all detections have valid types", () => {
    const validTypes = new Set([
      "road_damage", "damaged_sign", "overflowing_container",
      "traffic_sign", "traffic_light",
    ]);
    sampleDetections.forEach((d) => {
      expect(validTypes.has(d.type)).toBe(true);
    });
  });

  it("all detections have valid priorities", () => {
    const validPriorities = new Set(["high", "medium", "low"]);
    sampleDetections.forEach((d) => {
      expect(validPriorities.has(d.priority)).toBe(true);
    });
  });

  it("all detections have valid statuses", () => {
    const validStatuses = new Set(["new", "assigned", "resolved"]);
    sampleDetections.forEach((d) => {
      expect(validStatuses.has(d.status)).toBe(true);
    });
  });

  it("all detections have realistic Istanbul coordinates", () => {
    sampleDetections.forEach((d) => {
      // Istanbul lat range ~40.8–41.3, lng ~28.0–29.5
      expect(d.latitude).toBeGreaterThan(40.5);
      expect(d.latitude).toBeLessThan(41.5);
      expect(d.longitude).toBeGreaterThan(27.5);
      expect(d.longitude).toBeLessThan(30.0);
    });
  });

  it("all detections have unique IDs", () => {
    const ids = sampleDetections.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all detections have valid ISO timestamps", () => {
    sampleDetections.forEach((d) => {
      expect(Number.isNaN(Date.parse(d.detectedAt))).toBe(false);
    });
  });

  it("includes a mix of all three issue types", () => {
    const types = new Set(sampleDetections.map((d) => d.type));
    expect(types.has("road_damage")).toBe(true);
    expect(types.has("damaged_sign")).toBe(true);
    expect(types.has("overflowing_container")).toBe(true);
  });

  it("includes all three statuses", () => {
    const statuses = new Set(sampleDetections.map((d) => d.status));
    expect(statuses.has("new")).toBe(true);
    expect(statuses.has("assigned")).toBe(true);
    expect(statuses.has("resolved")).toBe(true);
  });

  it("calculateStats works correctly on the full city dataset", () => {
    const stats = calculateStats(sampleDetections);
    expect(stats.total).toBe(sampleDetections.length);
    expect(stats.urgent).toBe(sampleDetections.filter((d) => d.priority === "high").length);
    expect(stats.resolved).toBe(sampleDetections.filter((d) => d.status === "resolved").length);
    expect(stats.districts).toBeGreaterThanOrEqual(20);
  });

  it("filterDetections correctly filters city-wide data by district", () => {
    const result = filterDetections(sampleDetections, {
      district: "Kadikoy",
      type: "all",
      priority: "all",
      status: "all",
    });
    expect(result.length).toBeGreaterThan(0);
    result.forEach((d) => expect(d.district).toBe("Kadikoy"));
  });

  it("createDemoDetections produces a copy of city-wide data", () => {
    const demo = createDemoDetections(sampleDetections);
    expect(demo.length).toBe(sampleDetections.length);
    // Mutations to demo don't affect sampleDetections
    demo[0].status = "resolved";
    expect(sampleDetections[0].status).not.toBe("resolved");
  });
});
