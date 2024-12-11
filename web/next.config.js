/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@smoores/epub", "smoores/fs"],
  serverExternalPackages: ["piscina", "@mapbox/node-pre-gyp", "pino"],
}

export default nextConfig
