"use client"

import { useEffect } from "react"

function resolveCssColor(value: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#000"
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data
  if (red === undefined || green === undefined || blue === undefined) {
    return null
  }
  return { red: red / 255, green: green / 255, blue: blue / 255 }
}

// inside the tauri app, keep the native title bar the same color as the sidebar
export function TauriTitlebarSync() {
  useEffect(() => {
    let observer: MutationObserver | null = null
    let cancelled = false
    const isCancelled = () => cancelled

    void (async () => {
      const { isTauri, invoke } = await import("@tauri-apps/api/core")
      if (!isTauri() || isCancelled()) return

      const sync = () => {
        const styles = getComputedStyle(document.documentElement)
        const cssColor =
          styles.getPropertyValue("--sidebar").trim() ||
          styles.getPropertyValue("--background").trim()
        if (!cssColor) return
        const color = resolveCssColor(cssColor)
        if (color) void invoke("set_titlebar_color", color)
      }

      sync()
      observer = new MutationObserver(sync)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      })
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [])

  return null
}
