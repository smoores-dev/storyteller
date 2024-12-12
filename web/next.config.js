import { resolve } from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@smoores/epub", "smoores/fs"],
  serverExternalPackages: [
    "piscina",
    "@mapbox/node-pre-gyp",
    "pino",
    "pino-pretty",
  ],
  output: "standalone",
  outputFileTracingRoot: resolve(new URL(import.meta.url).pathname, "../.."),
}

export default nextConfig
