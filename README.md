# UrbanPulse

UrbanPulse turns privacy-safe urban-object detections from municipal service
vehicles into a city-wide maintenance map and action queue.

## Run Locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

## Demo Flow

1. Start on the built-in city-wide dataset.
2. Explain the route, issue markers, filters, and municipal KPIs.
3. Select an issue and assign or resolve it.
4. Import `examples/detections-import-example.json` as the AI handoff.
   The current minimal pipeline output is also accepted through
   `examples/ai-pipeline-output-example.json`.
5. Import `examples/deletion-report-example.json` as deletion proof.
6. Export the minimized compliance summary.
7. Use **Restore built-in demo** before another presentation run.

## AI Integration

The AI pipeline must produce JSON matching
`docs/person-1-output-contract.md`. The dashboard rejects unknown and forbidden
personal-data fields before rendering.

## Verification

```powershell
npm test
npm run build
```

## Feature Branch Order

These branches build on each other and should be merged in this order:

1. `codex/privacy-safe-json-import`
2. `codex/issue-details-route-coverage`
3. `codex/municipal-action-workflow`
4. `codex/compliance-audit-export`
5. `codex/demo-readiness`
6. `codex/ai-pipeline-adapter`
