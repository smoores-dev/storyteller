import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { MediaType } from "@storyteller-platform/media-types"

import { Button } from "@v3/_/components/ui/button"
import { Card, CardContent } from "@v3/_/components/ui/card"
import { V3Link } from "@v3/_/components/v3-link"

import { assertAuthenticatedUser } from "@/auth/auth"
import {
  DEVICE_AUTH_EXPIRES_IN_SECONDS,
  approveDeviceAuthorization,
  createDeviceAuthorization,
} from "@/database/deviceAuthorizations"
import { getDeviceEntryUrl, getDeviceQrCodeUrl } from "@/deviceAuthorization"

import { DeviceStartStatusPoller } from "./DeviceStartStatusPoller"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DeviceStartPage")
  return {
    title: t("title"),
  }
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

  const t = await getTranslations("DeviceStartPage")

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <DeviceStartStatusPoller deviceCode={deviceAuthorization.deviceCode} />
      <Card className="w-md max-w-sm overflow-hidden bg-transparent p-0 ring-0">
        <CardContent className="flex flex-col items-center gap-6 p-2 text-center">
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-heading text-3xl font-bold">
              {t("pairADevice")}
            </h1>
            <p className="text-muted-foreground text-balance">
              {t("scanThisQrCode")}
            </p>
          </div>

          <div className="rounded-lg bg-white p-3">
            <object
              data={qrCodeUrl}
              type={MediaType.SVG.mime}
              width={240}
              height={240}
              aria-label={t("qrCodeLabel")}
            >
              <a href={qrCodeUrl}>{t("openQrCode")}</a>
            </object>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="font-heading text-2xl font-bold tracking-widest">
              {deviceAuthorization.userCode}
            </p>
            <p className="text-muted-foreground text-sm text-balance">
              {t("manualEntry", { url: verificationUrl })}
            </p>
            <p className="text-muted-foreground text-sm text-balance">
              {t("expiresIn", {
                minutes: String(DEVICE_AUTH_EXPIRES_IN_SECONDS / 60),
              })}
            </p>
          </div>

          <Button
            variant="outline"
            nativeButton={false}
            render={
              <V3Link href="/preferences?tab=profile">
                {t("backToProfile")}
              </V3Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
