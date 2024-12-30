"use client"

import { BookDetail } from "@/apiModels"
import { useLiveBooks } from "@/hooks/useLiveBooks"
import { createContext, ReactNode, useContext } from "react"

const LiveBooksContext = createContext<BookDetail[]>([])

export function LiveBooksProvider(props: {
  initialBooks: BookDetail[]
  children: ReactNode
}) {
  const books = useLiveBooks(props.initialBooks)
  return (
    <LiveBooksContext.Provider value={books}>
      {props.children}
    </LiveBooksContext.Provider>
  )
}

export function useBooks() {
  return useContext(LiveBooksContext)
}
