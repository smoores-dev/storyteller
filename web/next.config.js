const API_HOST = process.env.STORYTELLER_API_HOST
const ROOT_PATH = process.env.STORYTELLER_ROOT_PATH

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
