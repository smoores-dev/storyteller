import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Button } from "@v3/_/components/ui/button"
import { Card, CardContent } from "@v3/_/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"

import { assertAuthenticatedUser, nextAuth } from "@/auth/auth"
import {
  DEVICE_AUTH_INTERVAL_SECONDS,
  approveDeviceAuthorization,
  denyDeviceAuthorization,
  getDeviceAuthorizationByDeviceCode,
  getDeviceAuthorizationByUserCode,
  isExpiredDeviceAuthorization,
  normalizeUserCode,
} from "@/database/deviceAuthorizations"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DevicePage")
  return {
    title: t("title"),
  }
}

function getCallbackUrl(searchParams: {
  device_code?: string
  user_code?: string
}) {
  const query = new URLSearchParams()
  if (searchParams.device_code) {
    query.set("device_code", searchParams.device_code)
  }
  if (searchParams.user_code) {
    query.set("user_code", normalizeUserCode(searchParams.user_code))
  }
  const queryString = query.toString()
  return queryString ? `/device?${queryString}` : "/device"
}

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{
    device_code?: string
    user_code?: string
  }>
}) {
  const params = await searchParams
  const basePath = (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"
  const callbackUrl = getCallbackUrl(params)
  const session = await nextAuth.auth()

  if (!session) {
    redirect(`${basePath}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  let deviceAuthorization = params.device_code
    ? await getDeviceAuthorizationByDeviceCode(params.device_code)
    : null

  if (!deviceAuthorization && params.user_code) {
    deviceAuthorization = await getDeviceAuthorizationByUserCode(
      params.user_code,
    )
  }

  const isExpired =
    !!deviceAuthorization && isExpiredDeviceAuthorization(deviceAuthorization)

  async function approve(formData: FormData) {
    "use server"
    const user = await assertAuthenticatedUser()

    const actionBasePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"

    const deviceCode = formData.get("device_code")?.valueOf()
    if (typeof deviceCode !== "string") {
      redirect(`${actionBasePath}/device`)
    }

    const currentDeviceAuthorization =
      await getDeviceAuthorizationByDeviceCode(deviceCode)
    if (
      !currentDeviceAuthorization ||
      isExpiredDeviceAuthorization(currentDeviceAuthorization)
    ) {
      redirect(`${actionBasePath}/device`)
    }

    await approveDeviceAuthorization(currentDeviceAuthorization.id, user.id)
    redirect(
      `${actionBasePath}/device?device_code=${encodeURIComponent(currentDeviceAuthorization.deviceCode)}`,
    )
  }

  async function deny(formData: FormData) {
    "use server"
    await assertAuthenticatedUser()

    const actionBasePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"

    const deviceCode = formData.get("device_code")?.valueOf()
    if (typeof deviceCode !== "string") {
      redirect(`${actionBasePath}/device`)
    }

    const currentDeviceAuthorization =
      await getDeviceAuthorizationByDeviceCode(deviceCode)
    if (
      !currentDeviceAuthorization ||
      isExpiredDeviceAuthorization(currentDeviceAuthorization)
    ) {
      redirect(`${actionBasePath}/device`)
    }

    await denyDeviceAuthorization(currentDeviceAuthorization.id)
    redirect(`${actionBasePath}/device`)
  }

  const t = await getTranslations("DevicePage")

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-0">
        <img
          src="/Storyteller_Logo.png"
          alt="Storyteller Logo"
          width={100}
          height={100}
        />
        <Card className="w-md max-w-sm overflow-hidden bg-transparent p-0 ring-0">
          <CardContent className="grid gap-6 p-2">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-heading text-3xl font-bold">
                {t("approveDeviceSignIn")}
              </h1>
              <p className="text-muted-foreground text-balance">
                {t("enterTheCodeShownOnYourDevice")}
              </p>
            </div>

            <form action={`${basePath}/device`} method="get">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="user_code">{t("code")}</FieldLabel>
                  <Input
                    id="user_code"
                    name="user_code"
                    placeholder="ABCD-EFGH"
                    defaultValue={
                      params.user_code
                        ? normalizeUserCode(params.user_code)
                        : ""
                    }
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="one-time-code"
                    className="text-center font-medium tracking-widest uppercase"
                  />
                </Field>
                <Field>
                  <Button
                    type="submit"
                    variant={deviceAuthorization ? "outline" : "default"}
                  >
                    {t("findRequest")}
                  </Button>
                </Field>
              </FieldGroup>
            </form>

            {!deviceAuthorization &&
              (params.user_code || params.device_code) && (
                <p className="text-destructive text-center text-sm">
                  {t("noMatchingRequest")}
                </p>
              )}

            {deviceAuthorization && (
              <div className="bg-background flex flex-col gap-4 rounded-lg border p-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="font-heading text-2xl font-bold tracking-widest">
                    {deviceAuthorization.userCode}
                  </p>
                  <p className="text-muted-foreground text-sm text-balance">
                    {isExpired
                      ? t("expired")
                      : deviceAuthorization.status === "approved"
                        ? t("approved")
                        : deviceAuthorization.status === "denied"
                          ? t("denied")
                          : deviceAuthorization.status === "consumed"
                            ? t("consumed")
                            : t("pending")}
                  </p>
                  {!isExpired && deviceAuthorization.status === "pending" && (
                    <p className="text-muted-foreground text-xs">
                      {t("pollingInterval", {
                        seconds: String(DEVICE_AUTH_INTERVAL_SECONDS),
                      })}
                    </p>
                  )}
                </div>

                {!isExpired && deviceAuthorization.status === "pending" && (
                  <div className="grid grid-cols-2 gap-2">
                    <form action={deny}>
                      <input
                        type="hidden"
                        name="device_code"
                        value={deviceAuthorization.deviceCode}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full"
                      >
                        {t("deny")}
                      </Button>
                    </form>
                    <form action={approve}>
                      <input
                        type="hidden"
                        name="device_code"
                        value={deviceAuthorization.deviceCode}
                      />
                      <Button type="submit" className="w-full">
                        {t("approve")}
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
