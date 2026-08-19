"use client"

import { type ReactNode, createContext, useContext } from "react"
import { type UseFormReturn } from "react-hook-form"
import { type z } from "zod"

import { cn } from "@/cn"
import { type SettingsSchema } from "@/database/settingsTypes"

import { type Tab } from "./tabs"

export type IsMatch = (tab: Tab, section: string) => boolean

export type SearchContextValue = {
  query: string
  isMatch: IsMatch
}

export const SearchContext = createContext<SearchContextValue>({
  query: "",
  isMatch: () => false,
})

export function SettingsSection({
  tab,
  section,
  children,
}: {
  tab: Tab
  section: string
  children: ReactNode
}) {
  const { query, isMatch } = useContext(SearchContext)
  const matches = isMatch(tab, section)

  if (query && !matches) return null

  return (
    <div
      className={cn(
        "max-w-2xl rounded-2xl",
        query && matches && "ring-primary/50 ring-1 ring-offset-0",
      )}
    >
      {children}
    </div>
  )
}

export type SettingsFormForm = UseFormReturn<z.infer<typeof SettingsSchema>>

export function safeUrl(base: string, path: string) {
  try {
    return new URL(path, base).toString()
  } catch {
    return `${base}/${path}`
  }
}
