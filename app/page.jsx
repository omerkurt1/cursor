"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`/`document` at import time, so the dashboard must only
// ever load on the client. Disabling SSR keeps the module out of the server bundle.
const Dashboard = dynamic(() => import("../components/Dashboard.jsx"), {
  ssr: false,
});

export default function Page() {
  return <Dashboard />;
}
