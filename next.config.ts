import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

process.env.NEXT_TELEMETRY_DISABLED = "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  skipMiddlewareUrlNormalize: true,
  outputFileTracingRoot: process.cwd(),
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // O build de produção não deve sobrescrever os módulos do servidor de desenvolvimento.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
