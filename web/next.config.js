import { resolve } from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@storyteller-platform/epub",
    "@storyteller-platform/fs",
    "@storyteller-platform/path",
    "@storyteller-platform/audiobooklib",
  ],
  serverExternalPackages: [
    "piscina",
    "@mapbox/node-pre-gyp",
    "pino",
    "pino-pretty",
    "onnxruntime-node",
  ],
  output: "standalone",
  outputFileTracingRoot: resolve(new URL(import.meta.url).pathname, "../.."),
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
  },
  turbopack: {
    resolveAlias: {
      "@storyteller-platform/epub": "../epub/index.ts",
      "@storyteller-platform/epub/node": "../epub/node.ts",
      "@storyteller-platform/fs": "../fs/index.ts",
      "@storyteller-platform/path": "../path/index.ts",
      "@storyteller-platform/audiobooklib": "../audiobook/src/index.ts",
      "@storyteller-platform/audiobooklib/node":
        "../audiobook/src/node/index.ts",
    },
  },
  /**
   *
   * @param {import('webpack').Configuration} config
   * @param {*} param1
   * @returns
   */
  webpack: (config, { isServer, dev }) => {
    if (isServer && !dev) {
      config.devtool = "source-map"
    }

    return config
  },
}

export default nextConfig
