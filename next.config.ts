import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "nmsalmanac.com", pathname: "/planets/**" }],
  },
  async redirects() {
    return [
      { source: "/stazioni", destination: "/stations", permanent: true },
      { source: "/utenti", destination: "/users", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/taxi-push-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
