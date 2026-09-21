"use client"

import { type ReactNode, createContext, useContext, useState } from "react"
import { type UseFormReturn } from "react-hook-form"
import { type z } from "zod"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import { type SettingsSchema } from "@/database/settingsTypes"
import * as icon from "@/icons"

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

export function AdvancedFields({ children }: { children: ReactNode }) {
  const t = useTranslation("SettingsPage")
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs">
        <icon.ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        {t("advanced")}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
