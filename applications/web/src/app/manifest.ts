import { type MetadataRoute } from "next"

import { getServerIcon } from "@/database/servers"
import { getSettings } from "@/database/settings"

export const dynamic = "force-dynamic"

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [settings, icon] = await Promise.all([getSettings(), getServerIcon()])

  const name = settings.libraryName || "Storyteller"

  const icons: MetadataRoute.Manifest["icons"] = icon
    ? [
        {
          src: "/api/v2/server/icon?s=192",
          sizes: "192x192",
          type: "image/webp",
        },
        {
          src: "/api/v2/server/icon?s=512",
          sizes: "512x512",
          type: "image/webp",
        },
      ]
    : [
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
      ]

  return {
    name,
    short_name: name,
    description: "A simple tool for syncing audiobooks and ebooks",
    start_url: ".",
    display: "standalone",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    prefer_related_applications: false,
    icons,
  }
}
