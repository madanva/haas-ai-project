import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export — produces a fully static site under `out/` on `next build`.
  // Deployable to any static host. The classified.json lives in /public so
  // admins can swap it without rebuilding the site.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
