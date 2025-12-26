import { type BookPreferences } from "@/database/preferencesTypes"
import { bookDetailPressed } from "@/store/actions"
import { localApi } from "@/store/localApi"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: bookDetailPressed,
  effect: async (action, listenerApi) => {
    listenerApi.unsubscribe()

    try {
      const { bookUuid, format } = action.payload

      const bookPrefs = await listenerApi
        .dispatch(
          localApi.endpoints.getBookPreferences.initiate({ uuid: bookUuid }),
        )
        .unwrap()

      const detailPrefs: BookPreferences["detailView"] = bookPrefs.detailView
        ? { ...bookPrefs.detailView }
        : {
            mode: "text",
            scope: "chapter",
          }

      if (detailPrefs.mode === "text" && detailPrefs.scope === "chapter") {
        detailPrefs.scope = "book"
      } else if (detailPrefs.mode === "text" && format === "readaloud") {
        detailPrefs.mode = "audio"
        detailPrefs.scope = "chapter"
      } else if (
        detailPrefs.mode === "audio" &&
        detailPrefs.scope === "chapter" &&
        format === "readaloud"
      ) {
        detailPrefs.scope = "book"
      } else {
        detailPrefs.mode = "text"
        detailPrefs.scope = "chapter"
      }

      await listenerApi
        .dispatch(
          localApi.endpoints.updateBookPreference.initiate({
            bookUuid,
            name: "detailView",
            value: detailPrefs,
          }),
        )
        .unwrap()
    } finally {
      listenerApi.subscribe()
    }
  },
})
