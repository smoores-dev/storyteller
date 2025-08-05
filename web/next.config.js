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
  /**
   *
   * @param {import('webpack').Configuration} config
   * @param {*} param1
   * @returns
   */
  webpack: (config, { isServer, dev }) => {
    if (dev) {
      if (isServer) {
        config.resolve.conditionNames = [
          "@storyteller-node",
          ...(config.resolve.conditionNames ?? ["..."]),
        ]
      } else {
        config.resolve.conditionNames = [
          "@storyteller",
          ...(config.resolve.conditionNames ?? ["..."]),
        ]
      }

      config.resolve.extensionAlias = {
        ...config.resolve.extensionAlias,
        ".js": [".ts", ".js"],
      }
    } else if (isServer) {
      config.resolve.conditionNames = [
        "node",
        ...(config.resolve.conditionNames ?? ["..."]),
      ]
    }

    if (isServer && !dev) {
      config.devtool = "source-map"
    }

    return config
  },
}

export default nextConfig
