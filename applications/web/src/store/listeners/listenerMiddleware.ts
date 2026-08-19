import {
  type TypedAddListener,
  addListener,
  createListenerMiddleware,
} from "@reduxjs/toolkit"

import { type AppDispatch, type RootState } from "@/store/appState"

export const listenerMiddleware = createListenerMiddleware()

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>()

export const addAppListener: TypedAddListener<RootState, AppDispatch> =
  addListener.withTypes<RootState, AppDispatch>()
