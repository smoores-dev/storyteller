"use client"

import { useCommandSearch } from "@v3/_/components/command-search"
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
import { useListHomeSectionsQuery } from "@/store/api"

function Widget({
  section,
  children,
  menuClassName,
  index,
}: {
  section: HomeSectionWithDetails
  children: React.ReactNode
  menuClassName?: string
  index: number
}) {
  return (
    <div className="group/section relative px-4">
      {children}
      {index > 0 && (
        <SectionMenu
          section={section}
          className={cn(
            "absolute top-2 right-6 opacity-0 transition-opacity group-hover/section:opacity-100",
            menuClassName,
          )}
        />
      )}
    </div>
  )
}

function Section({
  section,
  index,
}: {
  section: HomeSectionWithDetails
  index: number
}) {
  switch (section.kind) {
    case "hero":
      return (
        <Widget section={section} index={index}>
          <HeroSection />
        </Widget>
      )
    case "stats":
      return (
        <Widget section={section} index={index}>
          <StatsBar />
        </Widget>
      )
    case "getStarted":
      return (
        <Widget section={section} index={index}>
          <GetStartedSection section={section} />
        </Widget>
      )
    case "addSection":
      return (
        <Widget section={section} index={index} menuClassName="top-.5">
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
  const { data: fetchedSections, isLoading } = useListHomeSectionsQuery()
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
      <div className="flex flex-col items-center gap-8 py-2">
        <p className="text-muted-foreground text-sm">{t("sections.empty")}</p>
        <ShelfManager />
      </div>
    )
  }

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
      className={cn(
        "flex flex-col gap-8 py-4",
        heroFirst ? "-mt-5" : "pt-(--header-height)",
      )}
    >
      {enabled.map((section, index) => (
        <Section key={section.uuid} section={section} index={index} />
      ))}
    </div>
  )
}

export function HomeSectionsActions() {
  const t = useTranslation("HomePage")
  const tSidebar = useTranslation("AppSidebar")
  const { openSearch } = useCommandSearch()

  return (
    <>
      <TooltipButton
        variant="ghost"
        onClick={openSearch}
        tooltip={tSidebar("search")}
        aria-label={tSidebar("search")}
        shortcut={["Mod+K"]}
      >
        <icon.Search className="size-4" />
      </TooltipButton>

      <ShelfManager
        trigger={
          <TooltipButton
            variant="ghost"
            tooltip={t("sections.customize")}
            aria-label={t("sections.customize")}
          >
            <icon.Books className="size-4" />
          </TooltipButton>
        }
      />
    </>
  )
}
