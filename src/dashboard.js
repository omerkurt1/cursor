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

export function getRoutePoints(detections) {
  return [...detections]
    .sort((a, b) => new Date(a.detectedAt) - new Date(b.detectedAt))
    .map(({ latitude, longitude }) => [latitude, longitude]);
}

export function updateDetectionStatus(detections, id, status) {
  if (!allowedStatuses.has(status)) {
    throw new Error(`Unsupported status "${status}".`);
  }

  return detections.map((detection) =>
    detection.id === id ? { ...detection, status } : detection,
  );
}

export function normalizeDeletionReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Deletion report must be a JSON object.");
  }
  if (report.status !== "raw_data_deleted") {
    throw new Error('Deletion report status must be "raw_data_deleted".');
  }
  if (
    !Number.isInteger(report.deleted_file_count) ||
    report.deleted_file_count < 0
  ) {
    throw new Error("Deletion report must contain a valid deleted file count.");
  }

  const deletedAt = new Date(report.deleted_at);
  if (Number.isNaN(deletedAt.getTime())) {
    throw new Error("Deletion report must contain a valid deletion time.");
  }

  return {
    deletedAt: deletedAt.toISOString(),
    deletedFileCount: report.deleted_file_count,
    status: report.status,
  };
}

export function buildComplianceSummary(detections, deletionReport) {
  const deletionVerified = deletionReport?.status === "raw_data_deleted";

  return {
    generatedAt: new Date().toISOString(),
    status: deletionVerified ? "ready" : "pending_deletion_proof",
    purpose: "Urban object detection for municipal maintenance",
    detectionCount: detections.length,
    personalDataFieldsAccepted: false,
    anonymizationRequiredBeforeDetection: true,
    retainedDetectionFields: [...allowedFields],
    rawDataDeletion: {
      verified: deletionVerified,
      deletedAt: deletionReport?.deletedAt ?? null,
      deletedFileCount: deletionReport?.deletedFileCount ?? 0,
    },
  };
}

export function createDemoDetections(sampleDetections) {
  return sampleDetections.map((detection) => ({ ...detection }));
}

const allowedFields = new Set([
  "id",
  "district",
  "type",
  "latitude",
  "longitude",
  "confidence",
  "priority",
  "status",
  "detectedAt",
]);

const forbiddenFields = new Set([
  "face",
  "faceid",
  "identity",
  "licenseplate",
  "person",
  "personid",
  "plate",
  "trackingid",
  "vehicle",
  "vehicleid",
]);

const allowedTypes = new Set([
  "road_damage",
  "damaged_sign",
  "overflowing_container",
  "traffic_sign",
  "traffic_light",
]);
const allowedPriorities = new Set(["high", "medium", "low"]);
const allowedStatuses = new Set(["new", "assigned", "resolved"]);

function requireText(detection, field, index) {
  if (
    typeof detection[field] !== "string" ||
    detection[field].trim().length === 0
  ) {
    throw new Error(`Detection ${index + 1}: "${field}" must be non-empty text.`);
  }
}

function requireAllowedValue(detection, field, values, index) {
  if (!values.has(detection[field])) {
    throw new Error(`Detection ${index + 1}: invalid "${field}" value.`);
  }
}

function validateDetection(detection, index) {
  if (!detection || typeof detection !== "object" || Array.isArray(detection)) {
    throw new Error(`Detection ${index + 1}: each entry must be an object.`);
  }

  Object.keys(detection).forEach((field) => {
    if (forbiddenFields.has(field.toLowerCase())) {
      throw new Error(`Detection ${index + 1}: forbidden field "${field}".`);
    }
    if (!allowedFields.has(field)) {
      throw new Error(`Detection ${index + 1}: unexpected field "${field}".`);
    }
  });

  ["id", "district", "detectedAt"].forEach((field) =>
    requireText(detection, field, index),
  );
  requireAllowedValue(detection, "type", allowedTypes, index);
  requireAllowedValue(detection, "priority", allowedPriorities, index);
  requireAllowedValue(detection, "status", allowedStatuses, index);

  if (
    typeof detection.latitude !== "number" ||
    detection.latitude < -90 ||
    detection.latitude > 90
  ) {
    throw new Error(`Detection ${index + 1}: invalid "latitude" value.`);
  }
  if (
    typeof detection.longitude !== "number" ||
    detection.longitude < -180 ||
    detection.longitude > 180
  ) {
    throw new Error(`Detection ${index + 1}: invalid "longitude" value.`);
  }
  if (
    typeof detection.confidence !== "number" ||
    detection.confidence < 0 ||
    detection.confidence > 1
  ) {
    throw new Error(`Detection ${index + 1}: invalid "confidence" value.`);
  }
  if (Number.isNaN(Date.parse(detection.detectedAt))) {
    throw new Error(`Detection ${index + 1}: invalid "detectedAt" value.`);
  }
}

export function validateDetectionImport(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Import must contain a non-empty array of detections.");
  }
  if (value.length > 5000) {
    throw new Error("Import cannot contain more than 5,000 detections.");
  }

  value.forEach(validateDetection);
  return value;
}

const pipelineFields = new Set([
  "type",
  "latitude",
  "longitude",
  "confidence",
  "timestamp",
]);
const pipelineTypeMap = new Map([
  ["traffic_sign", "traffic_sign"],
  ["traffic_light", "traffic_light"],
  ["pothole", "road_damage"],
  ["damaged_sign", "damaged_sign"],
]);

function pipelineTimestampSeconds(timestamp) {
  if (typeof timestamp !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    throw new Error('Pipeline "timestamp" must use HH:MM:SS format.');
  }

  const [hours, minutes, seconds] = timestamp.split(":").map(Number);
  if (minutes > 59 || seconds > 59) {
    throw new Error('Pipeline "timestamp" must use HH:MM:SS format.');
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function normalizePipelineDetections(
  value,
  { district = "Unassigned", baseDate = new Date().toISOString() } = {},
) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Pipeline import must contain a non-empty detection array.");
  }

  const start = new Date(baseDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Pipeline import requires a valid base date.");
  }

  const normalized = value.map((detection, index) => {
    if (!detection || typeof detection !== "object" || Array.isArray(detection)) {
      throw new Error(`Pipeline detection ${index + 1} must be an object.`);
    }
    Object.keys(detection).forEach((field) => {
      if (!pipelineFields.has(field)) {
        throw new Error(
          `Pipeline detection ${index + 1}: unexpected field "${field}".`,
        );
      }
    });
    if (!pipelineTypeMap.has(detection.type)) {
      throw new Error(
        `Pipeline detection ${index + 1}: unsupported pipeline type "${detection.type}".`,
      );
    }

    const detectedAt = new Date(
      start.getTime() + pipelineTimestampSeconds(detection.timestamp) * 1000,
    ).toISOString();
    const adapted = {
      id: `AI-${String(index + 1).padStart(3, "0")}`,
      district,
      type: pipelineTypeMap.get(detection.type),
      latitude: detection.latitude,
      longitude: detection.longitude,
      confidence: detection.confidence,
      priority: detection.confidence >= 0.9 ? "high" : detection.confidence >= 0.75 ? "medium" : "low",
      status: "new",
      detectedAt,
    };
    validateDetection(adapted, index);
    return adapted;
  });

  return normalized;
}

export function normalizeLocalApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Pipeline API address must be a valid URL.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("Pipeline API must run on the local machine over HTTP.");
  }

  return url.origin;
}
