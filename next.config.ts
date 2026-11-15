import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Superset of the defaults for camera/microphone/geolocation and the
  // rest of the powerful features this app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers ignore this over plain HTTP, so it is safe in development
  // and only takes effect once the app is served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version in every response.
  poweredByHeader: false,
  // Next infers the workspace root by walking up the tree for a lockfile.
  // There is an unrelated package-lock.json in the user's home directory,
  // one level above this repo, so without pinning the root Next treats the
  // home directory as the project and warns (and traces the wrong files).
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
