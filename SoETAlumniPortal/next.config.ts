import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://soet-connect.onrender.com/:path*",
      },
    ];
  },
};

export default nextConfig;
