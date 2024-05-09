import {
  type AsyncThunk,
  type AsyncThunkOptions,
  type AsyncThunkPayloadCreator,
  createAsyncThunk,
} from "@reduxjs/toolkit"

import { store } from "./store"
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux"

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export type AppThunkConfig = {
  state: RootState
}

export function createAppThunk<Returned, ThunkArg>(
  typePrefix: string,
  payloadCreator: AsyncThunkPayloadCreator<Returned, ThunkArg, AppThunkConfig>,
  options?: AsyncThunkOptions<ThunkArg, AppThunkConfig>,
): AsyncThunk<Returned, ThunkArg, AppThunkConfig> {
  return createAsyncThunk(typePrefix, payloadCreator, options)
}

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
