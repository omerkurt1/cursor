import { describe, expect, it } from "vitest";
import {
  calculateStats,
  filterDetections,
  getRoutePoints,
  buildComplianceSummary,
  createDemoDetections,
  normalizePipelineDetections,
  normalizeDeletionReport,
  updateDetectionStatus,
  validateDetectionImport,
} from "./dashboard.js";

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

  it("rejects object types outside the pipeline contract", () => {
    expect(() =>
      normalizePipelineDetections([
        {
          type: "road_damage",
          latitude: 41.021,
          longitude: 28.874,
          confidence: 0.91,
          timestamp: "00:01:24",
        },
      ]),
    ).toThrow(/unsupported pipeline type/i);
  });
});
