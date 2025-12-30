import { devToolsEnhancer } from "@redux-devtools/remote"
import { configureStore } from "@reduxjs/toolkit"
import { produce } from "immer"
import "react-native-get-random-values"
import { createLogger } from "redux-logger"

import { logger } from "@/logger"

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
import { localApi } from "./localApi"
import { serverApi } from "./serverApi"
import { bookshelfSlice } from "./slices/bookshelfSlice"
import { loggingSlice } from "./slices/loggingSlice"

export const store = configureStore({
  reducer: {
    bookshelf: bookshelfSlice.reducer,
    logging: loggingSlice.reducer,
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
      createLogger({
        predicate: (_getState, action) =>
          !serverApi.internalActions.subscriptionsUpdated.match(action) &&
          !localApi.internalActions.subscriptionsUpdated.match(action),
        timestamp: false,
        duration: true,
        // redux-logger doesn't have a debug level,
        // so we set .log to the same power as
        // .debug
        level: "log",
        logger,
        colors: false,
        stateTransformer: () => "",
        actionTransformer: produce((action) => {
          const baseQueryMeta = action?.meta?.baseQueryMeta
          if (baseQueryMeta?.request?.headers) {
            delete baseQueryMeta.request.headers
          }
          if (baseQueryMeta?.response?.headers) {
            delete baseQueryMeta.response.headers
          }

          if (
            serverApi.endpoints.listBooks.matchFulfilled(action) ||
            serverApi.endpoints.getBook.matchFulfilled(action) ||
            localApi.endpoints.listBooks.matchFulfilled(action) ||
            localApi.endpoints.getBook.matchFulfilled(action)
          ) {
            // @ts-expect-error Intentionally deleting payload for logging
            delete action.payload
          }
        }),
      }),
    ]),
  devTools: false,
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().concat(
      devToolsEnhancer({
        name: "Storyteller React Native",
      }),
    ),
})
