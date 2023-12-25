/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath: ROOT_PATH,
  async rewrites() {
    return [
      {
        source: `/api/:path*`,
        destination: `${API_HOST}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
