"use client"

import { createContext, useContext } from "react"

const DocumentTitleContext = createContext("%s")

export function DocumentTitleProvider({
  template,
  children,
}: {
  template: string
  children: React.ReactNode
}) {
  return (
    <DocumentTitleContext.Provider value={template}>
      {children}
    </DocumentTitleContext.Provider>
  )
}

export function DocumentTitle({
  parts,
}: {
  parts: (string | null | undefined | false)[]
}) {
  const template = useContext(DocumentTitleContext)
  const title = parts
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" • ")
  if (!title) return null
  return <title>{template.replace("%s", title)}</title>
}
