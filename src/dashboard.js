export function filterDetections(detections, filters) {
  return detections.filter((detection) =>
    Object.entries(filters).every(
      ([key, value]) => value === "all" || detection[key] === value,
    ),
  );
}

export function calculateStats(detections) {
  return {
    total: detections.length,
    urgent: detections.filter((detection) => detection.priority === "high")
      .length,
    resolved: detections.filter((detection) => detection.status === "resolved")
      .length,
    districts: new Set(detections.map((detection) => detection.district)).size,
  };
}
