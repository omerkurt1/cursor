# Person 1 Output Contract

The dashboard accepts one JSON array containing privacy-safe urban detections.

## Required Fields

| Field | Accepted value |
| --- | --- |
| `id` | Non-empty unique text |
| `district` | Non-empty district name |
| `type` | `road_damage`, `damaged_sign`, or `overflowing_container` |
| `latitude` | Number from -90 to 90 |
| `longitude` | Number from -180 to 180 |
| `confidence` | Number from 0 to 1 |
| `priority` | `high`, `medium`, or `low` |
| `status` | `new`, `assigned`, or `resolved` |
| `detectedAt` | ISO-compatible date and time |

Use `examples/detections-import-example.json` as the working example.

## Privacy Rules

- Export only the nine required fields.
- Do not export images, image paths, faces, plates, person identifiers, vehicle identifiers, or tracking identifiers.
- Anonymize faces and license plates before urban-object detection.
- Keep raw footage local and delete it when required by the hackathon rules.

The dashboard rejects unknown fields to enforce data minimization. A rejected
import does not replace the previously loaded dataset.
