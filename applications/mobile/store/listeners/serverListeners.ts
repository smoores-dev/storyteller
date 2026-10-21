import { documentDirectory } from "expo-file-system/legacy"
import { Image } from "expo-image"
import * as SecureStore from "expo-secure-store"

import { getBookCoverShas, updateBook } from "@/database/books"
import { localApi } from "@/store/localApi"
import { getCoverUrl } from "@/store/serverApi"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: localApi.endpoints.deleteServer.matchFulfilled,
  effect: async (action) => {
    const { uuid: serverUuid } = action.meta.arg.originalArgs
    const { server, downloadedBooks } = action.payload

    await SecureStore.deleteItemAsync(`server.${serverUuid}.token`)

    const shasByUuid = await getBookCoverShas(downloadedBooks)

    for (const uuid of downloadedBooks) {
      const shas = shasByUuid[uuid]
      if (!shas) continue

      const ebookCoverUrl = getCoverUrl(server.baseUrl, shas, "text")
      const audiobookCoverUrl = getCoverUrl(server.baseUrl, shas, "audio")

      await updateBook(uuid, {
        ebookCoverUrl:
          (await Image.getCachePathAsync(ebookCoverUrl))?.replace(
            documentDirectory!,
            "",
          ) ?? null,
        audiobookCoverUrl:
          (await Image.getCachePathAsync(audiobookCoverUrl))?.replace(
            documentDirectory!,
            "",
          ) ?? null,
      })
    }
  },
})
