import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"

import createNextIntlPlugin from "next-intl/plugin"

import { locales } from "./src/i18n/locales"
import { V3_ROOTS } from "./src/v3Routes"

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as Record<string, unknown>

const repoRoot = resolve(new URL(import.meta.url).pathname, "../../..")

const notNeededAtRuntime = new Set(["onnxruntime-web", "@types/node"])

function packageClosure(roots: string[]) {
  const seen = new Set<string>()
  const walk = (name: string) => {
    const dir = resolve(repoRoot, "node_modules", name)
    if (seen.has(name) || notNeededAtRuntime.has(name) || !existsSync(dir))
      return
    seen.add(name)
    const pkg = JSON.parse(
      readFileSync(resolve(dir, "package.json"), "utf-8"),
    ) as {
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    for (const dep of [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]) {
      walk(dep)
    }
  }
  roots.forEach(walk)
  return [...seen]
}

const untracedRuntimePackages = packageClosure([
  "onnxruntime-node",
  "@huggingface/transformers",
  "@parcel/watcher",
  "kuromoji",
  "@storyteller-platform/nodekit",
])

function packageGlobs(name: string) {
  const dir = resolve(repoRoot, "node_modules", name)
  const prefix = `../../node_modules/${name}`
  if (name !== "onnxruntime-node") return [`${prefix}/**`]
  return readdirSync(dir).map((entry) => {
    if (entry === "bin")
      return `${prefix}/bin/napi-v6/${process.platform}/${process.arch}/**`
    return statSync(resolve(dir, entry)).isDirectory()
      ? `${prefix}/${entry}/**`
      : `${prefix}/${entry}`
  })
}

const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: ["./messages/en.json", "./messages/nl.json"],

    messages: {
      path: "./messages",
      format: "json",
      precompile: true,
      locales: Object.keys(locales),
    },
  },
})

const nextConfig: import("next").NextConfig = {
  redirects: () => [
    {
      source: "/opds",
      destination: "/opds/v1",
      permanent: true,
    },
    { source: "/account", destination: "/preferences", permanent: false },
    { source: "/users", destination: "/settings?tab=users", permanent: false },
  ],
  rewrites: () => ({
    beforeFiles: [
      { source: "/", destination: "/v3" },
      ...V3_ROOTS.map((root) => ({
        source: `/${root}/:path*`,
        destination: `/v3/${root}/:path*`,
      })),
    ],
  }),
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg["version"] as string,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@storyteller-platform/epub",
    "@storyteller-platform/epubcfi",
    "@storyteller-platform/fs",
    "@storyteller-platform/path",
    "@storyteller-platform/audiobook",
    "@storyteller-platform/media-types",
    "@storyteller-platform/uri-fragment",
    "@t3-oss/env-nextjs",
    "@t3-oss/env-core",
  ],
  serverExternalPackages: [
    "piscina",
    "@mapbox/node-pre-gyp",
    "pino",
    "pino-pretty",
    "onnxruntime-node",
    "@huggingface/transformers",
    "@node-rs/crc32",
    "@node-rs/xxhash",
    "@parcel/watcher",
    "@reflink/reflink",
    "@storyteller-platform/okmain",
    "@storyteller-platform/nodekit",
  ],
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "*": [
      ...untracedRuntimePackages.flatMap(packageGlobs),
      "../../node_modules/better-sqlite3/prebuilds/**",
    ],
  },
  outputFileTracingExcludes: {
    "*": ["./src/__fixtures__/**"],
  },
  reactCompiler: true,
  productionBrowserSourceMaps: true,
  experimental: {
    authInterrupts: true,
    turbopackSourceMaps: true,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: [
          ...(process.env["EXTRA_DEV_ORIGINS"]
            ? [process.env["EXTRA_DEV_ORIGINS"]]
            : []),
          "127.0.0.1",
        ],
      }
    : {}),
}

export default withNextIntl(nextConfig)
