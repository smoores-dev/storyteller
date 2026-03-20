import { type Token } from "@/apiModels"

import { saveServerSession } from "./saveServerSession"

type DeviceTokenError = {
  error?: string
  error_description?: string
}

type CurrentUser = {
  username: string | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function exchangeDeviceCode(serverUrl: string, deviceCode: string) {
  const tokenUrl = new URL("/api/v2/device/token", serverUrl)
  let intervalMs = 1_000

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_code: deviceCode }),
    })

    const body = (await response.json()) as Token | DeviceTokenError

    if (response.ok) {
      return body as Token
    }

    const errorBody = body as DeviceTokenError

    if (errorBody.error === "authorization_pending") {
      await sleep(intervalMs)
      continue
    }

    if (errorBody.error === "slow_down") {
      intervalMs += 5_000
      await sleep(intervalMs)
      continue
    }

    throw new Error(
      errorBody.error_description ?? errorBody.error ?? "Device sign-in failed",
    )
  }

  throw new Error("Timed out waiting for device authorization")
}

async function getCurrentUser(serverUrl: string, accessToken: string) {
  const response = await fetch(new URL("/api/v2/user", serverUrl), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch current user: ${response.status}`)
  }

  return (await response.json()) as CurrentUser
}

export async function signInWithDeviceCode(
  serverUrl: string,
  deviceCode: string,
) {
  const normalizedServerUrl = new URL("/", serverUrl).toString()
  const sessionToken = await exchangeDeviceCode(normalizedServerUrl, deviceCode)
  const user = await getCurrentUser(
    normalizedServerUrl,
    sessionToken.access_token,
  )

  if (!user.username) {
    throw new Error("Signed in, but the server did not return a username")
  }

  await saveServerSession({
    serverUrl: normalizedServerUrl,
    sessionToken,
    username: user.username,
  })

  return {
    serverUrl: normalizedServerUrl,
    username: user.username,
  }
}
