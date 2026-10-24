import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const isDev = process.env.NODE_ENV === "development";
    const backendUrl = isDev
      ? (process.env.BACKEND_URL || "http://127.0.0.1:8000")
      : process.env.BACKEND_URL;

    if (!backendUrl) {
      return [];
    }

    const normalizedBackendUrl = backendUrl.replace(/\/+$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${normalizedBackendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
