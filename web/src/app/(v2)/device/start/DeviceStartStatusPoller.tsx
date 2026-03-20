"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

type Props = {
  deviceCode: string
}

export function DeviceStartStatusPoller({ deviceCode }: Props) {
  const router = useRouter()

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
          router.replace("/account")
        }
      } catch {
        // Ignore transient polling failures and retry.
      }
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, 2_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [deviceCode, router])

  return null
}
