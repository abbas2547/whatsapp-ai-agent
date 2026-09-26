import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },
  // Local dev speed (project lives on a slow external USB HDD):
  // - turbopackFileSystemCacheForDev: persistent Turbopack cache, warm restarts
  // - optimizePackageImports: pre-optimize big barrel packages so each page
  //   compiles faster in dev
  experimental: {
    turbopackFileSystemCacheForDev: true,
    // Compile independent routes in parallel in `next dev` — big win on
    // multi-core machines when many pages compile on first load.
    parallelServerCompiles: true,
    optimizePackageImports: [
      "lucide-react",
      "@xyflow/react",
      "date-fns",
      "framer-motion",
      "react-hook-form",
      "sonner",
    ],
  },
};

export default nextConfig;
