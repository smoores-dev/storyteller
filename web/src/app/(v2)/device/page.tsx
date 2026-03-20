import {
  Button,
  Center,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { type Metadata } from "next"
import { redirect } from "next/navigation"

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

export const metadata: Metadata = {
  title: "Approve Device Sign-In",
}

type Props = {
  searchParams: Promise<{
    device_code?: string
    user_code?: string
  }>
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

export default async function DevicePage({ searchParams }: Props) {
  const params = await searchParams
  const callbackUrl = getCallbackUrl(params)
  const session = await nextAuth.auth()

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
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

    const deviceCode = formData.get("device_code")?.valueOf()
    if (typeof deviceCode !== "string") {
      redirect("/device")
    }

    const currentDeviceAuthorization =
      await getDeviceAuthorizationByDeviceCode(deviceCode)
    if (
      !currentDeviceAuthorization ||
      isExpiredDeviceAuthorization(currentDeviceAuthorization)
    ) {
      redirect("/device")
    }

    await approveDeviceAuthorization(currentDeviceAuthorization.id, user.id)
    redirect(
      `/device?device_code=${encodeURIComponent(currentDeviceAuthorization.deviceCode)}`,
    )
  }

  async function deny(formData: FormData) {
    "use server"
    await assertAuthenticatedUser()

    const deviceCode = formData.get("device_code")?.valueOf()
    if (typeof deviceCode !== "string") {
      redirect("/device")
    }

    const currentDeviceAuthorization =
      await getDeviceAuthorizationByDeviceCode(deviceCode)
    if (
      !currentDeviceAuthorization ||
      isExpiredDeviceAuthorization(currentDeviceAuthorization)
    ) {
      redirect("/device")
    }

    await denyDeviceAuthorization(currentDeviceAuthorization.id)
    redirect("/device")
  }

  return (
    <Center className="min-h-screen px-4 pt-10 pb-24">
      <Paper className="w-full max-w-xl p-8">
        <Stack className="gap-6">
          <Stack className="gap-2 text-center">
            <Title order={1}>Approve device sign-in</Title>
            <Text c="dimmed">
              Enter the code shown on your device to approve sign-in.
            </Text>
          </Stack>

          <form action="/device" method="get">
            <Stack className="gap-3">
              <TextInput
                name="user_code"
                label="Enter code"
                placeholder="ABCD-EFGH"
                defaultValue={
                  params.user_code ? normalizeUserCode(params.user_code) : ""
                }
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <Button type="submit">Approve device</Button>
            </Stack>
          </form>

          {!deviceAuthorization && (
            <Text c="dimmed" ta="center">
              Enter the code from your device, then sign in and approve the
              request.
            </Text>
          )}

          {deviceAuthorization && (
            <Stack className="gap-4">
              <Stack className="items-center gap-3 text-center">
                <Title order={3}>{deviceAuthorization.userCode}</Title>
                <Text c="dimmed">
                  {isExpired
                    ? "This pairing request has expired. Start again from your app."
                    : deviceAuthorization.status === "approved"
                      ? "This device is approved. Return to the app to finish pairing."
                      : deviceAuthorization.status === "denied"
                        ? "This pairing request was denied. Start again from your app if needed."
                        : deviceAuthorization.status === "consumed"
                          ? "This pairing request has already been used."
                          : "Approve this request to let the app sign in to your account."}
                </Text>
                {!isExpired && (
                  <Text size="sm" c="dimmed">
                    Polling devices should retry about every{" "}
                    {DEVICE_AUTH_INTERVAL_SECONDS} seconds.
                  </Text>
                )}
              </Stack>

              {!isExpired && deviceAuthorization.status === "pending" && (
                <Group grow>
                  <form action={deny}>
                    <input
                      type="hidden"
                      name="device_code"
                      value={deviceAuthorization.deviceCode}
                    />
                    <Button type="submit" variant="default" fullWidth>
                      Deny
                    </Button>
                  </form>
                  <form action={approve}>
                    <input
                      type="hidden"
                      name="device_code"
                      value={deviceAuthorization.deviceCode}
                    />
                    <Button type="submit" fullWidth>
                      Approve
                    </Button>
                  </form>
                </Group>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Center>
  )
}
