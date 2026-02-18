import * as Linking from "expo-linking"
import { useRouter } from "expo-router"
import * as SecureStore from "expo-secure-store"
import * as WebBrowser from "expo-web-browser"
import { jwtDecode } from "jwt-decode"

import { type Token } from "@/apiModels"
import { getServerByUrl, updateServer } from "@/database/servers"
import { logger } from "@/logger"
import { useAppDispatch } from "@/store/appState"
import { localApi, useCreateServerMutation } from "@/store/localApi"
import { type UUID, randomUUID } from "@/uuid"

import { Button } from "./ui/button"
import { Text } from "./ui/text"

interface Props {
  serverUrl: string
  serverUuid?: UUID
}

export function LoginButton({ serverUrl, serverUuid }: Props) {
  const router = useRouter()
  const [createServer] = useCreateServerMutation()
  const dispatch = useAppDispatch()
  return (
    <Button
      size="flex"
      onPress={async () => {
        const redirectUrl = Linking.createURL("settings")
        const tokenUrl = new URL("/api/v2/token/app", serverUrl)
        const result = await WebBrowser.openAuthSessionAsync(
          tokenUrl.toString(),
          redirectUrl,
        )

        if (result.type !== "success") {
          const errorMessage = `Failed to log in: Auth session result - ${result.type}`
          logger.error(errorMessage)
          alert(errorMessage)
          return
        }

        const token = Linking.parse(result.url).queryParams?.["token"] as
          | string
          | undefined

        if (!token) {
          const errorMessage = `Failed to log in: Server did not return an auth token`
          logger.error(errorMessage)
          alert(errorMessage)
          return
        }

        const decoded = jwtDecode(token)
        const username = decoded.sub
        if (!username) {
          const errorMessage = `Failed to log in: Auth token is missing username`
          logger.error(errorMessage)
          alert(errorMessage)
          return
        }

        const response = await fetch(new URL("/api/v2/token/app", serverUrl), {
          method: "POST",
          body: JSON.stringify({ token }),
        })

        if (!response.ok) {
          const errorMessage = `Failed to log in: ${response.status} - ${await response.text()}`
          logger.error(errorMessage)
          alert(errorMessage)
          return
        }

        const sessionToken = (await response.json()) as Token

        let uuid!: UUID
        if (!serverUuid) {
          const { uuid: newUuid } =
            (await getServerByUrl(serverUrl)) ??
            (await createServer({
              uuid: randomUUID(),
              baseUrl: serverUrl,
            }).unwrap())
          uuid = newUuid
        } else {
          uuid = serverUuid
        }

        await SecureStore.setItemAsync(
          `server.${uuid}.token`,
          sessionToken.access_token,
          { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
        )

        await updateServer(uuid, { username })

        dispatch(localApi.util.invalidateTags(["Servers"]))

        router.replace("settings")
      }}
    >
      <Text>Login</Text>
    </Button>
  )
}
