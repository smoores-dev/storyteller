import { documentDirectory } from "expo-file-system/legacy"
import { Image } from "expo-image"
import * as SecureStore from "expo-secure-store"

import { updateBook } from "@/database/books"
import { localApi } from "@/store/localApi"
import { getCoverUrl } from "@/store/serverApi"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: localApi.endpoints.deleteServer.matchFulfilled,
  effect: async (action) => {
    const { uuid: serverUuid } = action.meta.arg.originalArgs
    const { server, downloadedBooks } = action.payload

    await SecureStore.deleteItemAsync(`server.${serverUuid}.token`)

    for (const uuid of downloadedBooks) {
      await updateBook(uuid, {
        ebookCoverUrl:
          (
            await Image.getCachePathAsync(
              getCoverUrl(server.baseUrl, uuid, {
                height: 352,
                width: 232,
              }),
            )
          )?.replace(documentDirectory!, "") ?? null,
        audiobookCoverUrl:
          (
            await Image.getCachePathAsync(
              getCoverUrl(server.baseUrl, uuid, {
                height: 232,
                width: 232,
                audio: true,
              }),
            )
          )?.replace(documentDirectory!, "") ?? null,
      })
    }
  },
})
