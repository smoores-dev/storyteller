// @ts-check

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import createNextIntlPlugin from "next-intl/plugin"

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
)

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
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
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
    "@node-rs/xxhash",
    "@parcel/watcher",
    "@reflink/reflink",
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
