/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      "piscina",
      "pymport",
      "@mapbox/node-pre-gyp",
    ],
  },
}

export default nextConfig
