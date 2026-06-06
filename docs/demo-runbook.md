# UrbanPulse Demo Runbook

## Before Presenting

- Run `npm test` and `npm run build`.
- Start the dashboard with `npm run dev`.
- Keep both example JSON files ready in `examples/`.
- Confirm no raw footage is inside Git or cloud storage.
- Click **Restore built-in demo**.

## Two-Minute Presentation

1. **Problem:** Municipal street information is manually collected, delayed,
   and fragmented.
2. **Solution:** Existing service vehicles become privacy-safe mobile sensors.
3. **Map:** Show city-wide detections and the scanned route.
4. **Action:** Select a high-priority issue, assign it, then resolve it.
5. **AI handoff:** Import the privacy-safe detection JSON.
   The dashboard automatically adapts the current five-field AI pipeline output.
   For the strongest demo, run the pipeline API on `127.0.0.1:8000` and click
   **Connect live pipeline**.
   Point out whether the evidence panel says **Real model output** or
   **Clearly labeled demo fallback**, then show anonymization and dedupe counts.
   If the source says **Street View fallback**, explicitly state that it is a
   development fallback and the production source remains municipal vehicle cameras.
6. **Compliance:** Import deletion proof and export the minimized audit summary.
7. **Close:** UrbanPulse helps municipalities see earlier, respond faster, and
   use existing public resources more effectively.

## Fallback Plan

- If the AI model is unavailable, clearly label and use the example detection
  JSON for integration demonstration.
- If the map tiles are unavailable, the issue queue, filters, KPIs, workflow,
  and compliance console still demonstrate the product.
- If a previous demo changed the state, click **Restore built-in demo**.
