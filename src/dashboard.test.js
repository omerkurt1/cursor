import { describe, expect, it } from "vitest";
import { calculateStats, filterDetections } from "./dashboard.js";

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
