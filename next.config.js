/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled to prevent Leaflet's map container from initializing twice in dev
  // (StrictMode double-invokes effects, which conflicts with imperative map setup).
  reactStrictMode: false,
};

module.exports = nextConfig;
