import * as Linking from "expo-linking"
import { useRouter } from "expo-router"
import * as SecureStore from "expo-secure-store"
import * as WebBrowser from "expo-web-browser"
import { jwtDecode } from "jwt-decode"

import { type Token } from "@/apiModels"
import { getServerByUrl, updateServer } from "@/database/servers"
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
          alert("Login failed")
          return
        }

        const token = Linking.parse(result.url).queryParams?.["token"] as
          | string
          | undefined

        if (!token) {
          alert("Login failed")
          return
        }

        const decoded = jwtDecode(token)
        const username = decoded.sub
        if (!username) {
          alert("Login failed")
          return
        }

        const response = await fetch(new URL("/api/v2/token/app", serverUrl), {
          method: "POST",
          body: JSON.stringify({ token }),
        })

        if (!response.ok) {
          alert("Login failed")
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
