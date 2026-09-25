"use client"

import { createContext, useContext, useState } from "react"

import { UploadBookDialog } from "@v3/_/components/books/UploadBookDialog"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"

import { type UUID } from "@/uuid"

type UploadTarget = { collection?: UUID; files?: File[] }

type OpenBookUpload = (target?: UploadTarget) => void

const UploadBookContext = createContext<OpenBookUpload>(() => {})

export function useOpenBookUpload() {
  return useContext(UploadBookContext)
}

export function UploadBookProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<UploadTarget>({})
  const { setSelectedBookUuid } = useBookInSidePanel()

  const openBookUpload: OpenBookUpload = (next = {}) => {
    setTarget(next)
    setOpen(true)
  }

  return (
    <UploadBookContext.Provider value={openBookUpload}>
      {children}
      <UploadBookDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTarget(({ collection }) => ({ collection }))
        }}
        collection={target.collection}
        initialFiles={target.files}
        onBookCreated={(bookUuid) => {
          void setSelectedBookUuid(bookUuid)
        }}
      />
    </UploadBookContext.Provider>
  )
}
