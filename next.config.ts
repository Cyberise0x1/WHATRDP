import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  webpack(config, { webpack }) {
    if (process.env.CLOUDFLARE_BUILD === "1") {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@\/lib\/database$/,
          resolve(process.cwd(), "src/lib/database.cloudflare.ts"),
        ),
      );
    }
    return config;
  },
  async headers() {
    return ["/api/orders/:path*", "/order/:path*"].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
};

export default nextConfig;
