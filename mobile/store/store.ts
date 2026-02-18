import { devToolsEnhancer } from "@redux-devtools/remote"
import { configureStore } from "@reduxjs/toolkit"
import "react-native-get-random-values"

import { addStorytellerEventListeners } from "./events/storytellerEvents"
import "./listeners/bookDetailListener"
import "./listeners/bookImportedListener"
import "./listeners/bookOpenListener"
import "./listeners/downloadListener"
import "./listeners/listBooksListener"
import { listenerMiddleware } from "./listeners/listenerMiddleware"
import "./listeners/logsListener"
import "./listeners/playerListeners"
import "./listeners/positionSyncListener"
import "./listeners/serverListeners"
import "./listeners/sleepTimerListener"
import "./listeners/syncListeners"
import "./listeners/themeListener"
import { localApi } from "./localApi"
import { serverApi } from "./serverApi"
import { bookshelfSlice } from "./slices/bookshelfSlice"

export const store = configureStore({
  reducer: {
    bookshelf: bookshelfSlice.reducer,
    [serverApi.reducerPath]: serverApi.reducer,
    [localApi.reducerPath]: localApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }).concat([
      listenerMiddleware.middleware,
      serverApi.middleware,
      localApi.middleware,
    ]),
  devTools: false,
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().concat(
      devToolsEnhancer({
        name: "Storyteller React Native",
      }),
    ),
})

addStorytellerEventListeners(store)
