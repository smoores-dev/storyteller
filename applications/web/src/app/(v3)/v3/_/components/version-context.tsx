"use client"

import { createContext, useContext } from "react"

type VersionContextValue = {
  basePath: string
}

const VersionContext = createContext<VersionContextValue>({ basePath: "/v3" })

export function VersionProvider({
  basePath,
  children,
}: {
  basePath: string
  children: React.ReactNode
}) {
  return (
    <VersionContext.Provider value={{ basePath }}>
      {children}
    </VersionContext.Provider>
  )
}

export function useVersionBasePath() {
  return useContext(VersionContext).basePath
}
