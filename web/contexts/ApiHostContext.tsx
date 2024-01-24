"use client"

import { ReactNode, createContext } from "react"

export const ApiHostContext = createContext({ rootPath: "" })

type Props = {
  value: { rootPath: string }
  children: ReactNode
}

export function ApiHostContextProvider({ value, children }: Props) {
  return (
    <ApiHostContext.Provider value={value}>{children}</ApiHostContext.Provider>
  )
}
