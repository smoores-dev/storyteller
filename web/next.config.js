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
    "@smoores/epub",
    "@smoores/fs",
    "@smoores/path",
    "@smoores/audiobook",
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
      "@smoores/epub": "../epub/index.ts",
      "@smoores/epub/node": "../epub/node.ts",
      "@smoores/fs": "../fs/index.ts",
      "@smoores/path": "../path/index.ts",
      "@smoores/audiobook": "../audiobook/index.ts",
      "@smoores/audiobook/node": "../audiobook/src/node/index.ts",
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
