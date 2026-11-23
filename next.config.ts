import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output = small runtime image for Cloud Run.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "@google-cloud/storage", "@google/genai"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
