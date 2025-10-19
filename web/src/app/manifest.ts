import { type MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Storyteller",
    short_name: "Storyteller",
    description: "A simple tool for syncing audiobooks and ebooks",
    start_url: ".",
    display: "standalone",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    prefer_related_applications: false,
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
