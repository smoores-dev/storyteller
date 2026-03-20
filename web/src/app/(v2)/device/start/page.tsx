import { Anchor, Center, Paper, Stack, Text, Title } from "@mantine/core"
import { type Metadata } from "next"
import { headers } from "next/headers"

import { assertAuthenticatedUser } from "@/auth/auth"
import {
  DEVICE_AUTH_EXPIRES_IN_SECONDS,
  approveDeviceAuthorization,
  createDeviceAuthorization,
} from "@/database/deviceAuthorizations"
import { getDeviceEntryUrl, getDeviceQrCodeUrl } from "@/deviceAuthorization"

import { DeviceStartStatusPoller } from "./DeviceStartStatusPoller"

export const metadata: Metadata = {
  title: "Start Device Pairing",
}

function DeviceQrCode({ qrCodeUrl }: { qrCodeUrl: string }) {
  return (
    <object
      data={qrCodeUrl}
      type="image/svg+xml"
      width={240}
      height={240}
      aria-label="QR code for device pairing"
    >
      <a href={qrCodeUrl}>Open QR code</a>
    </object>
  )
}

export default async function StartDevicePage() {
  const user = await assertAuthenticatedUser()
  const requestHeaders = await headers()
  const deviceAuthorization = await createDeviceAuthorization()
  await approveDeviceAuthorization(deviceAuthorization.id, user.id)

  const host = requestHeaders.get("host")
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https"
  const requestOrigin =
    requestHeaders.get("origin") ?? (host ? `${proto}://${host}` : undefined)

  const qrCodeUrl = await getDeviceQrCodeUrl({
    deviceCode: deviceAuthorization.deviceCode,
    ...(requestOrigin != null && { fallbackOrigin: requestOrigin }),
  })
  const verificationUrl = await getDeviceEntryUrl(requestOrigin)

  return (
    <Center className="min-h-screen px-4 pt-10 pb-24">
      <Paper className="w-full max-w-xl p-8">
        <Stack className="items-center gap-5 text-center">
          <DeviceStartStatusPoller
            deviceCode={deviceAuthorization.deviceCode}
          />
          <Stack className="gap-2">
            <Title order={1}>Pair a device</Title>
            <Text c="dimmed">Scan this QR code from your device.</Text>
          </Stack>

          <DeviceQrCode qrCodeUrl={qrCodeUrl} />

          <Stack className="gap-1">
            <Title order={2}>{deviceAuthorization.userCode}</Title>
            <Text c="dimmed">
              If scanning does not work, open {verificationUrl} on another
              device or browser and enter the code above.
            </Text>
            <Text c="dimmed">
              This code expires in {DEVICE_AUTH_EXPIRES_IN_SECONDS / 60}{" "}
              minutes. If expires, please refresh this page to get a new code.
            </Text>
          </Stack>

          <Stack className="w-full gap-2">
            <Anchor href="/account">Back to your account</Anchor>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}
