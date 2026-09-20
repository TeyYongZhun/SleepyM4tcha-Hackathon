import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // The demo inbox is read from disk at runtime; make sure Vercel bundles it
  outputFileTracingIncludes: { "/dashboard/**/*": ["./public/dummy/**/*"] },
};

export default nextConfig;
