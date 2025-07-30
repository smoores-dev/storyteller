import { api } from "@/store/api"
import { useAppDispatch } from "@/store/appState"
import { skipToken, SkipToken } from "@reduxjs/toolkit/query"
import { useRef } from "react"

export function useInitialData<
  Endpoint extends Parameters<typeof api.util.upsertQueryData>[0],
>(thunk: SkipToken | ReturnType<typeof api.util.upsertQueryData<Endpoint>>) {
  const dispatch = useAppDispatch()
  const initialized = useRef(false)
  if (!initialized.current) {
    if (thunk !== skipToken) {
      void dispatch(thunk)
    }
    initialized.current = true
  }
}
