"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useVersionBasePath } from "@v3/_/components/version-context"

export function DeviceStartStatusPoller({
  deviceCode,
}: {
  deviceCode: string
}) {
  const router = useRouter()
  const basePath = useVersionBasePath()

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const response = await fetch(
          `/api/v2/device/status/${encodeURIComponent(deviceCode)}`,
          {
            cache: "no-store",
          },
        )

        if (!response.ok) {
          return
        }

        const body = (await response.json()) as { status?: string }
        if (!cancelled && body.status === "consumed") {
          router.replace(`${basePath}/preferences?tab=profile`)
        }
      } catch {}
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, 2_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [basePath, deviceCode, router])

  return null
}
