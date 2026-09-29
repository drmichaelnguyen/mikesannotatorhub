import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "120mb",
    },
    middlewareClientMaxBodySize: "120mb",
  },
};

export default nextConfig;
