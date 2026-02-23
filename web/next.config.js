// @ts-check

import { resolve } from "node:path"

import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin({
  // this is nice, but requires next 16
  // experimental: {
  // srcPath: "./src",
  // messages: {
  //   path: "./messages",
  //   format: "json",
  //   locales: "infer",
  // },
  // createMessagesDeclaration: ["./messages/en.json", "./messages/nl.json"],
  // extract: {
  //   sourceLocale: "./messages/en.json",
  // },
  // },
})

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
    "@storyteller-platform/audiobook",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
  ],
  serverExternalPackages: [
    "piscina",
    "@mapbox/node-pre-gyp",
    "pino",
    "pino-pretty",
    "onnxruntime-node",
    "@node-rs/crc32",
  ],
  output: "standalone",
  outputFileTracingRoot: resolve(new URL(import.meta.url).pathname, "../.."),
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    authInterrupts: true,
    reactCompiler: true,
  },
  webpack: (config, { isServer, dev }) => {
    if (isServer && !dev) {
      config.devtool = "source-map"
    }

    return config
  },
}

export default withNextIntl(nextConfig)
