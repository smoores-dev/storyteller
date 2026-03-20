import { type NextRequest, NextResponse } from "next/server"

import {
  DEVICE_AUTH_EXPIRES_IN_SECONDS,
  createDeviceAuthorization,
} from "@/database/deviceAuthorizations"
import {
  getDeviceEntryUrl,
  getDeviceQrCodeUrl,
  getDeviceVerificationUrl,
} from "@/deviceAuthorization"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { deviceCode, userCode, intervalSeconds } =
    await createDeviceAuthorization()
  const fallbackOrigin = request.headers.get("Origin") ?? request.nextUrl.origin
  const verificationUri = await getDeviceVerificationUrl({
    deviceCode,
    fallbackOrigin,
  })
  const qrSvgUrl = await getDeviceQrCodeUrl({
    deviceCode,
    fallbackOrigin,
  })
  const manualVerificationUri = await getDeviceEntryUrl(fallbackOrigin)

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: manualVerificationUri,
    verification_uri_complete: verificationUri,
    expires_in: DEVICE_AUTH_EXPIRES_IN_SECONDS,
    interval: intervalSeconds,
    qr_svg_url: qrSvgUrl,
  })
}
