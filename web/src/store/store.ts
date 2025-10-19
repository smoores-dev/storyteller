import { configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"

import { api } from "./api"
import "./listeners"
import { listenerMiddleware } from "./listeners/listenerMiddleware"
import { audioPlayerReducer } from "./slices/audioPlayerSlice"
import { preferencesReducer } from "./slices/preferencesSlice"
import { readingSessionReducer } from "./slices/readingSessionSlice"

export function makeStore() {
  const store = configureStore({
    devTools: true,
    reducer: {
      [api.reducerPath]: api.reducer,

      audioPlayer: audioPlayerReducer,
      readingSession: readingSessionReducer,
      preferences: preferencesReducer,
    },

    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      })
        .concat(api.middleware)
        .concat(listenerMiddleware.middleware),
  })

  setupListeners(store.dispatch)

  return store
}

export type AppStore = ReturnType<typeof makeStore>
