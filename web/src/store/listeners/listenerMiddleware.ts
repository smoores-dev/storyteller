import { addListener, createListenerMiddleware } from "@reduxjs/toolkit"

import { type AppDispatch, type RootState } from "../appState"

export const listenerMiddleware = createListenerMiddleware()

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>()

export const addAppListener = addListener.withTypes<RootState, AppDispatch>()
