import { type NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"

import {
  getDeviceAuthorizationByDeviceCode,
  isExpiredDeviceAuthorization,
} from "@/database/deviceAuthorizations"
import { getDeviceVerificationUrl } from "@/deviceAuthorization"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    deviceCode: string
  }>
}

export async function GET(
  request: NextRequest,
  { params }: Props,
): Promise<NextResponse> {
  const { deviceCode } = await params
  const deviceAuthorization =
    await getDeviceAuthorizationByDeviceCode(deviceCode)

  if (
    !deviceAuthorization ||
    isExpiredDeviceAuthorization(deviceAuthorization)
  ) {
    return new NextResponse(null, { status: 404 })
  }
  const fallbackOrigin = request.headers.get("Origin") ?? request.nextUrl.origin

  const svg = await QRCode.toString(
    await getDeviceVerificationUrl({
      deviceCode: deviceAuthorization.deviceCode,
      fallbackOrigin,
    }),
    {
      type: "svg",
      margin: 1,
      width: 320,
    },
  )

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  })
}
