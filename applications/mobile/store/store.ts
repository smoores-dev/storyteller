import { configureStore } from "@reduxjs/toolkit"
import "react-native-get-random-values"

import { addSleepTimerEventListeners } from "./events/sleepTimerEvents"
import { addStorytellerEventListeners } from "./events/storytellerEvents"
import "./listeners/bookDetailListener"
import "./listeners/bookImportedListener"
import "./listeners/bookOpenListener"
import "./listeners/downloadListener"
import "./listeners/footnotesListener"
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
import { sleepTimerSlice } from "./slices/sleepTimerSlice"
import { transferFeedbackSlice } from "./slices/transferFeedbackSlice"

export const store = configureStore({
  reducer: {
    bookshelf: bookshelfSlice.reducer,
    sleepTimer: sleepTimerSlice.reducer,
    transferFeedback: transferFeedbackSlice.reducer,
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
})

addStorytellerEventListeners(store)
addSleepTimerEventListeners(store)
