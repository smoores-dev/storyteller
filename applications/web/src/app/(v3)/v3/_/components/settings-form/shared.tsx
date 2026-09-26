"use client"

import { type ReactNode, createContext, useContext, useState } from "react"
import { type UseFormReturn } from "react-hook-form"
import { type z } from "zod"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
import { InfoTip } from "@v3/_/components/ui/info-tip"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import { type SettingsSchema } from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type Tab,
  canSeeSection,
} from "./tabs"

export type IsMatch = (section: SettingsSectionId) => boolean

export type SearchContextValue = {
  query: string
  isMatch: IsMatch
  targetSection?: string | null
}

export const SearchContext = createContext<SearchContextValue>({
  query: "",
  isMatch: () => false,
})

const SectionRevealContext = createContext(false)

function useRevealableOpen(defaultOpen: boolean) {
  const reveal = useContext(SectionRevealContext)
  const [open, setOpen] = useState(defaultOpen || reveal)
  const [revealed, setRevealed] = useState(reveal)

  if (reveal !== revealed) {
    setRevealed(reveal)
    if (reveal) setOpen(true)
  }

  return [open, setOpen] as const
}

export function SettingsSection({
  id,
  children,
}: {
  id: SettingsSectionId
  children: ReactNode
}) {
  const { query, isMatch, targetSection } = useContext(SearchContext)
  const permissions = usePermissions()
  const matches = isMatch(id)
  const section = SETTINGS_SECTIONS.find((section) => section.id === id)

  if (query && !matches) return null
  if (section && !canSeeSection(section, permissions)) return null

  return (
    <div
      id={`settings-${id}`}
      className={cn(
        "max-w-2xl scroll-mt-4 rounded-2xl",
        query && matches && "ring-primary/50 ring-1 ring-offset-0",
      )}
    >
      <SectionRevealContext.Provider
        value={Boolean(query) || targetSection === id}
      >
        {children}
      </SectionRevealContext.Provider>
    </div>
  )
}

export function SettingsCard({
  title,
  description,
  tip,
  collapsible = false,
  defaultOpen = true,
  contentClassName,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  tip?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  contentClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useRevealableOpen(defaultOpen)

  const heading = (
    <div className="grid gap-1.5">
      <CardTitle className="flex items-center gap-2">
        <h2>
          {collapsible ? (
            <CollapsibleTrigger className="focus-visible:after:ring-ring/30 cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-t-lg focus-visible:after:ring-2">
              {title}
            </CollapsibleTrigger>
          ) : (
            title
          )}
        </h2>
        {tip && <InfoTip className="relative">{tip}</InfoTip>}
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </div>
  )

  if (!collapsible) {
    return (
      <Card>
        <CardHeader>{heading}</CardHeader>
        <CardContent className={cn("space-y-4", contentClassName)}>
          {children}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="relative flex flex-row items-start justify-between gap-2">
          {heading}
          <icon.ChevronDown
            aria-hidden
            className={cn(
              "text-muted-foreground mt-0.5 size-4 shrink-0 stroke-[1.5] transition-transform",
              open && "rotate-180",
            )}
          />
        </CardHeader>
        <CollapsibleContent>
          <CardContent className={cn("space-y-4 pt-4", contentClassName)}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

export function SettingsLink({
  children,
  ...target
}: ({ section: SettingsSectionId } | { tab: Tab }) & {
  children: ReactNode
}) {
  const href =
    "section" in target
      ? `/settings?tab=${SETTINGS_SECTIONS.find(({ id }) => id === target.section)?.page}&section=${target.section}`
      : `/settings?tab=${target.tab}`

  return (
    <V3Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
    >
      {children}
      <icon.ArrowRight className="size-3.5" />
    </V3Link>
  )
}

export function AdvancedFields({ children }: { children: ReactNode }) {
  const t = useTranslation("SettingsPage")
  const [open, setOpen] = useRevealableOpen(false)

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

export function OptionWithHint({
  label,
  hint,
}: {
  label: ReactNode
  hint?: ReactNode
}) {
  if (!hint) return <>{label}</>

  return (
    <div className="flex flex-col">
      <span>{label}</span>
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  )
}
