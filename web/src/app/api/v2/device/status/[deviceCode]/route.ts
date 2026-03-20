import {
  getDeviceAuthorizationByDeviceCode,
  isExpiredDeviceAuthorization,
} from "@/database/deviceAuthorizations"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    deviceCode: string
  }>
}

export async function GET(_: Request, { params }: Props) {
  const { deviceCode } = await params
  const deviceAuthorization =
    await getDeviceAuthorizationByDeviceCode(deviceCode)

  if (
    !deviceAuthorization ||
    isExpiredDeviceAuthorization(deviceAuthorization)
  ) {
    return Response.json({ status: "expired" }, { status: 404 })
  }

  return Response.json({ status: deviceAuthorization.status })
}
