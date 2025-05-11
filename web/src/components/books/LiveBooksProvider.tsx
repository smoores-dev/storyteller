"use client"

import { BookDetail } from "@/apiModels"
import { BookUpdatePayload } from "@/events"
import { useLiveBooks } from "@/hooks/useLiveBooks"
import { UUID } from "@/uuid"
import { createContext, ReactNode, useContext, useEffect, useMemo } from "react"

const LiveBooksContext = createContext<{
  books: BookDetail[]
  registerUpdateCallback: (
    callback: (update: BookUpdatePayload) => void,
  ) => () => void
}>({ books: [], registerUpdateCallback: () => () => {} })

export function LiveBooksProvider(props: {
  initialBooks: BookDetail[]
  children: ReactNode
}) {
  const value = useLiveBooks(props.initialBooks)
  return (
    <LiveBooksContext.Provider value={value}>
      {props.children}
    </LiveBooksContext.Provider>
  )
}

export function useBooks(onUpdate?: (update: BookUpdatePayload) => void) {
  const { books, registerUpdateCallback } = useContext(LiveBooksContext)

  useEffect(() => {
    if (!onUpdate) return
    return registerUpdateCallback(onUpdate)
  }, [onUpdate, registerUpdateCallback])

  return books
}

export function useBook(
  uuid: UUID,
  onUpdate?: (update: BookUpdatePayload) => void,
) {
  const { books, registerUpdateCallback } = useContext(LiveBooksContext)

  useEffect(() => {
    if (!onUpdate) return
    return registerUpdateCallback((update: BookUpdatePayload) => {
      if (uuid !== update.uuid) return
      onUpdate(update)
    })
  }, [onUpdate, registerUpdateCallback, uuid])

  return useMemo(
    () => books.find((book) => book.uuid === uuid) ?? null,
    [books, uuid],
  )
}
