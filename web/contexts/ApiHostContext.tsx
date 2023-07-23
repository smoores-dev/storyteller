"use client"

import { ReactNode, createContext } from "react"

export const ApiHostContext = createContext("")

type Props = {
  value: string
  children: ReactNode
}

export function ApiHostContextProvider({ value, children }: Props) {
  return (
    <ApiHostContext.Provider value={value}>{children}</ApiHostContext.Provider>
  )
}
