/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@smoores/epub", "smoores/fs"],
  serverExternalPackages: ["piscina", "@mapbox/node-pre-gyp"],
}

export default nextConfig
