"use client"

import { AddSectionSection } from "@v3/_/components/home/AddSectionSection"
import { GetStartedSection } from "@v3/_/components/home/GetStartedSection"
import { HeroSection } from "@v3/_/components/home/HeroSection"
import { SectionMenu } from "@v3/_/components/home/SectionMenu"
import { StatsBar } from "@v3/_/components/home/StatsBar"
import { ShelfManager, ShelfRow } from "@v3/_/components/shelves"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { type HomeSectionWithDetails } from "@/database/shelves"
import * as icon from "@/icons"
import { useListHomeShelvesQuery } from "@/store/api"

function Widget({
  section,
  children,
  menuClassName,
}: {
  section: HomeSectionWithDetails
  children: React.ReactNode
  menuClassName?: string
}) {
  return (
    <div className="group/section relative px-4">
      {children}
      <SectionMenu
        section={section}
        className={cn(
          "absolute top-2 right-6 opacity-0 transition-opacity group-hover/section:opacity-100",
          menuClassName,
        )}
      />
    </div>
  )
}

function Section({ section }: { section: HomeSectionWithDetails }) {
  switch (section.kind) {
    case "hero":
      return (
        <Widget section={section}>
          <HeroSection />
        </Widget>
      )
    case "stats":
      return (
        <Widget section={section}>
          <StatsBar />
        </Widget>
      )
    case "getStarted":
      return (
        <Widget section={section}>
          <GetStartedSection section={section} />
        </Widget>
      )
    case "addSection":
      return (
        <Widget section={section} menuClassName="top-.5">
          <AddSectionSection />
        </Widget>
      )
    default:
      return (
        <ShelfRow shelf={section} actions={<SectionMenu section={section} />} />
      )
  }
}

export function HomeSections({
  initialSections,
}: {
  initialSections?: HomeSectionWithDetails[]
}) {
  const t = useTranslation("HomePage")
  const { data: fetchedSections, isLoading } = useListHomeShelvesQuery()
  const sections = fetchedSections ?? initialSections

  if (isLoading && !sections) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <icon.Loader className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  if (!sections || sections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground text-sm">{t("sections.empty")}</p>
        <ShelfManager />
      </div>
    )
  }

  // keep stored order but always sink the add-section footer to the bottom.
  const enabled = sections
    .filter((section) => section.enabled)
    .sort((a, b) => {
      if (a.kind === "addSection") return 1
      if (b.kind === "addSection") return -1
      return 0
    })

  const heroFirst = enabled[0]?.kind === "hero"

  return (
    <div
      className={cn("flex flex-col gap-8 py-4", heroFirst ? "-mt-5" : "pt-6")}
    >
      {enabled.map((section) => (
        <Section key={section.uuid} section={section} />
      ))}
    </div>
  )
}

export function HomeSectionsActions() {
  const t = useTranslation("HomePage")
  return (
    <ShelfManager
      trigger={
        <TooltipButton
          variant="ghost"
          size="sm"
          tooltip={t("sections.customize")}
          aria-label={t("sections.customize")}
        >
          <icon.Books className="mr-2 size-4" />
        </TooltipButton>
      }
    />
  )
}
