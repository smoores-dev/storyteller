import {
  type AsyncThunk,
  type AsyncThunkOptions,
  type AsyncThunkPayloadCreator,
  createAsyncThunk,
} from "@reduxjs/toolkit"
import { useDispatch, useSelector, useStore } from "react-redux"

import { type AppStore } from "./store"

export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]

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

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
export const useAppStore = useStore.withTypes<AppStore>()
