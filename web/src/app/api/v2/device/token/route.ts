import { addSeconds, isBefore } from "date-fns"

import { createSessionTokenForUserId } from "@/auth/auth"
import {
  consumeDeviceAuthorization,
  getDeviceAuthorizationByDeviceCode,
  isDeviceAuthorizationApproved,
  isDeviceAuthorizationPending,
  isExpiredDeviceAuthorization,
  updateDeviceAuthorization,
} from "@/database/deviceAuthorizations"

export const dynamic = "force-dynamic"

function jsonError(error: string, status: number, error_description?: string) {
  return Response.json(
    {
      error,
      ...(error_description && { error_description }),
    },
    { status },
  )
}

export async function POST(request: Request) {
  let deviceCode: string | null = null

  if (request.headers.get("Content-Type")?.includes("application/json")) {
    const body = (await request.json()) as { device_code?: string }
    deviceCode = body.device_code ?? null
  } else {
    const body = await request.formData()
    const value = body.get("device_code")?.valueOf()
    deviceCode = typeof value === "string" ? value : null
  }

  if (!deviceCode) {
    return jsonError("invalid_request", 400, "device_code is required")
  }

  const deviceAuthorization =
    await getDeviceAuthorizationByDeviceCode(deviceCode)
  if (!deviceAuthorization) {
    return jsonError("invalid_grant", 400, "Unknown device_code")
  }

  if (isExpiredDeviceAuthorization(deviceAuthorization)) {
    return jsonError("expired_token", 400)
  }

  if (
    deviceAuthorization.lastPolledAt &&
    isBefore(
      new Date(),
      addSeconds(
        deviceAuthorization.lastPolledAt,
        deviceAuthorization.intervalSeconds,
      ),
    )
  ) {
    return jsonError("slow_down", 400)
  }

  await updateDeviceAuthorization(deviceAuthorization.id, {
    lastPolledAt: new Date(),
  })

  if (isDeviceAuthorizationPending(deviceAuthorization.status)) {
    return jsonError("authorization_pending", 400)
  }

  if (deviceAuthorization.status === "denied") {
    return jsonError("access_denied", 400)
  }

  if (deviceAuthorization.status === "consumed") {
    return jsonError("expired_token", 400)
  }

  if (
    !isDeviceAuthorizationApproved(deviceAuthorization.status) ||
    !deviceAuthorization.approvedByUserId
  ) {
    return jsonError("server_error", 500, "Invalid device authorization state")
  }

  const session = await createSessionTokenForUserId(
    deviceAuthorization.approvedByUserId,
  )
  await consumeDeviceAuthorization(deviceAuthorization.id)

  return Response.json({
    ...session,
    interval: deviceAuthorization.intervalSeconds,
  })
}
