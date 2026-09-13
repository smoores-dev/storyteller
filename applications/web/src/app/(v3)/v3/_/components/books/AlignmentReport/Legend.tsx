"use client"

import { type ReactNode } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@v3/_/components/ui/popover"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import {
  GAP,
  type ReportTone,
  SENTENCE_LADDER,
  STRIPES,
  TONE_FILL,
  TRACK_PLACED_GOOD,
} from "./shared"

function Swatch({ className }: { className: string }) {
  return (
    <i
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-xs", className)}
    />
  )
}

function Entry({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Swatch className={swatch} />
      {children}
    </span>
  )
}

const FILLS = [
  { key: "solid", swatch: cn(TONE_FILL.good, "opacity-80") },
  { key: "soft", swatch: cn(TONE_FILL.good, "opacity-35") },
  { key: "striped", swatch: STRIPES },
  { key: "gap", swatch: GAP },
  { key: "dimmed", swatch: cn(TONE_FILL.good, "opacity-30") },
] as const

const TRACK_TONES = [
  "moderate",
  "poor",
  "muted",
] as const satisfies readonly ReportTone[]

const TRACK_LABEL = {
  moderate: "trackModerate",
  poor: "trackPoor",
  muted: "trackMuted",
} as const

export function Legend({ className }: { className?: string }) {
  const t = useTranslation("AlignmentReport")

  const steps = SENTENCE_LADDER.map((step, index) => {
    const above = SENTENCE_LADDER[index - 1]
    const label =
      above === undefined
        ? t("legend.andUp", { min: step.min })
        : step.min === 0
          ? t("legend.under", { max: above.min })
          : t("legend.between", { min: step.min, max: above.min })
    return { tone: step.tone, label }
  })

  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]",
        className,
      )}
    >
      <span className="text-foreground/80 font-medium">
        {t("legend.sentences")}
      </span>
      {steps.map((step) => (
        <Entry key={step.label} swatch={TONE_FILL[step.tone]}>
          {step.label}
        </Entry>
      ))}
      <span className="bg-border h-3 w-px" aria-hidden />
      {FILLS.map((fill) => (
        <Entry key={fill.key} swatch={fill.swatch}>
          {t(`legend.${fill.key}`)}
        </Entry>
      ))}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground -my-1"
              aria-label={t("legend.help")}
              title={t("legend.help")}
            />
          }
        >
          <icon.HelpCircle />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-3">
          <p className="text-foreground/90">{t("legend.explain.chapters")}</p>
          <p className="text-foreground/90">{t("legend.explain.fills")}</p>
          <p className="text-foreground/90">{t("legend.explain.track")}</p>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <Entry swatch={TONE_FILL.good}>
              {t("legend.explain.trackGood", { min: TRACK_PLACED_GOOD })}
            </Entry>
            {TRACK_TONES.map((tone) => (
              <Entry key={tone} swatch={TONE_FILL[tone]}>
                {t(`legend.explain.${TRACK_LABEL[tone]}`)}
              </Entry>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <span>{t("legend.track")}</span>
    </div>
  )
}
