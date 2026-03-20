import { networkInterfaces } from "node:os"

import { getSettings } from "@/database/settings"
import { env } from "@/env"

function isLocalhostUrl(candidate: string) {
  try {
    const { hostname } = new URL(candidate)
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    )
  } catch {
    return false
  }
}

function getLanAddress() {
  const interfaces = networkInterfaces()

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue
      }

      if (
        address.address.startsWith("10.") ||
        address.address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
      ) {
        return address.address
      }
    }
  }

  return undefined
}

function normalizeDeviceBaseUrl(candidate: string) {
  const parsed = new URL(candidate)

  if (!isLocalhostUrl(parsed.toString())) {
    return parsed.toString()
  }

  const lanAddress = getLanAddress()
  if (!lanAddress) {
    return parsed.toString()
  }

  parsed.hostname = lanAddress
  return parsed.toString()
}

export function getDeviceVerificationPath(deviceCode: string) {
  return `/device?device_code=${encodeURIComponent(deviceCode)}`
}

export function getDeviceEntryPath() {
  return "/device"
}

export async function getDeviceVerificationUrl({
  deviceCode,
  fallbackOrigin,
}: {
  deviceCode: string
  fallbackOrigin?: string
}) {
  const baseUrl = await getDeviceVerificationBaseUrl(fallbackOrigin)
  return new URL(getDeviceVerificationPath(deviceCode), baseUrl).toString()
}

export async function getDeviceEntryUrl(fallbackOrigin?: string) {
  const baseUrl = await getDeviceVerificationBaseUrl(fallbackOrigin)
  return new URL(getDeviceEntryPath(), baseUrl).toString()
}

export async function getDeviceQrCodeUrl({
  deviceCode,
  fallbackOrigin,
}: {
  deviceCode: string
  fallbackOrigin?: string
}) {
  const baseUrl = await getDeviceVerificationBaseUrl(fallbackOrigin)
  return new URL(
    `/api/v2/device/qr/${encodeURIComponent(deviceCode)}`,
    baseUrl,
  ).toString()
}

async function getDeviceVerificationBaseUrl(fallbackOrigin?: string) {
  const configuredWebUrl = (await getSettings()).webUrl

  const candidates =
    fallbackOrigin &&
    isLocalhostUrl(fallbackOrigin) &&
    configuredWebUrl &&
    !isLocalhostUrl(configuredWebUrl)
      ? [configuredWebUrl, fallbackOrigin, env.AUTH_URL]
      : [fallbackOrigin, configuredWebUrl, env.AUTH_URL]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    try {
      return normalizeDeviceBaseUrl(candidate)
    } catch {
      continue
    }
  }

  throw new Error("No valid base URL available for device authorization")
}
