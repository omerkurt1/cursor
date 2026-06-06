"use client";

import dynamic from "next/dynamic";

// The Leaflet map touches `window` and the DOM, so the dashboard must only ever
// load on the client. Disabling SSR keeps the map code out of the server bundle.
const Dashboard = dynamic(() => import("../components/Dashboard.jsx"), {
  ssr: false,
});

export default function Page() {
  return <Dashboard />;
}
