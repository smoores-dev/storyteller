import { TAURI_UA_TOKEN } from "@/isTauriApp"

const CLIENT_NAME_MAX_LENGTH = 60

const LIBRARY_PRODUCTS = new Set([
  "mozilla",
  "applewebkit",
  "khtml",
  "gecko",
  "version",
  "mobile",
  "safari",
  "chrome",
  "chromium",
  "crios",
  "firefox",
  "fxios",
  "edg",
  "edgios",
  "edga",
  "opr",
  "electron",
  "cfnetwork",
  "darwin",
  "okhttp",
  "dalvik",
])

const APP_NAMES: Record<string, string> = {
  [TAURI_UA_TOKEN]: "Storyteller desktop",
}

const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:iOS|A)?\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bSafari\//, "Safari"],
]

const SYSTEMS: Array<[RegExp, string]> = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
]

export function describeUserAgent(userAgent: string | null) {
  if (!userAgent) return null

  const products = Array.from(
    userAgent.replace(/\([^)]*\)/g, " ").matchAll(/([A-Za-z][\w-]*)\/[\w.]+/g),
    (match) => match[1] ?? "",
  )
  const product = products.find(
    (product) => !LIBRARY_PRODUCTS.has(product.toLowerCase()),
  )
  const app = product
    ? (APP_NAMES[product] ?? product)
    : BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]

  const client = [app, system].filter(Boolean).join(" on ")
  return client ? client.slice(0, CLIENT_NAME_MAX_LENGTH) : null
}
