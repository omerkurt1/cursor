import { describe, expect, it } from "vitest";
import {
  calculateStats,
  filterDetections,
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
