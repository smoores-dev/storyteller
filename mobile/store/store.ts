import { devToolsEnhancer } from "@redux-devtools/remote"
import { configureStore } from "@reduxjs/toolkit"
import "react-native-get-random-values"

import "./listeners/bookDetailListener"
import "./listeners/bookImportedListener"
import "./listeners/bookOpenListener"
import "./listeners/downloadListener"
import "./listeners/listBooksListener"
import { listenerMiddleware } from "./listeners/listenerMiddleware"
import "./listeners/playerListeners"
import "./listeners/positionSyncListener"
import "./listeners/serverListeners"
import "./listeners/sleepTimerListener"
import "./listeners/syncListeners"
import { localApi } from "./localApi"
// import { crashReportingMiddleware } from "./middleware/crashReporting"
import { loggingMiddleware } from "./middleware/logging"
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
      loggingMiddleware,
    ]),
  devTools: false,
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().concat(
      devToolsEnhancer({
        name: "Storyteller React Native",
      }),
    ),
})
