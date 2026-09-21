"use client"

import { motion, useReducedMotion } from "motion/react"
import dynamic from "next/dynamic"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { type Aligner } from "@storyteller-platform/ghost-story/constants"

import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"

import { type CrystalMode } from "./quartz-scene"

const QuartzCanvas = dynamic(
  () => import("./quartz-scene").then((module) => module.QuartzCanvas),
  { ssr: false },
)

const HOVER_INTENT_MS = 90

export function AlignerPicker({
  value,
  onChange,
  disabled,
}: {
  value: Aligner
  onChange: (value: Aligner) => void
  disabled?: boolean
}) {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const reducedMotion = useReducedMotion() ?? false
  const [hovered, setHovered] = useState<Aligner | null>(null)
  const intent = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [spins, setSpins] = useState(0)

  useEffect(() => {
    return () => {
      clearTimeout(intent.current)
    }
  }, [])

  const hoverProps = (aligner: Aligner) => ({
    onPointerEnter: () => {
      clearTimeout(intent.current)
      intent.current = setTimeout(() => {
        setHovered(aligner)
      }, HOVER_INTENT_MS)
    },
    onPointerLeave: () => {
      clearTimeout(intent.current)
      setHovered(null)
    },
  })

  const ctcSelected = value === "ctc"
  const crystalMode: CrystalMode = ctcSelected
    ? "selected"
    : hovered === "ctc"
      ? "hover"
      : "hidden"

  return (
    <div className="@container">
      <RadioGroup
        value={value}
        onValueChange={(next: unknown) => {
          if (next !== "whisper" && next !== "ctc") return
          onChange(next)
          if (next === "ctc") {
            setSpins((count) => count + 1)
          }
        }}
        disabled={disabled}
        className={cn(
          "@lg:grid-cols-2 grid grid-cols-1 gap-5 transition-[margin] duration-500 ease-out",
          crystalMode === "hidden" ? "mt-2" : "mt-20",
        )}
      >
        <Tile
          value="whisper"
          selected={value === "whisper"}
          title={t("aligners.whisper.label")}
          description={t.rich("aligners.whisper.description", {
            error_link: (chunks) => (
              <a
                href="https://github.com/corticph/error-align"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
          {...hoverProps("whisper")}
          stage={
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_at_50%_100%,rgb(251_146_60/0.35),transparent_65%)] opacity-40 transition-opacity duration-500",
                "group-hover/tile:opacity-80 group-has-data-checked/tile:opacity-100",
              )}
            />
          }
        />

        <Tile
          value="ctc"
          selected={ctcSelected}
          tone="ctc"
          title={t("aligners.ctc.label")}
          badge={
            <ShinyBadge animate={!reducedMotion}>
              {t("aligners.ctc.badge")}
            </ShinyBadge>
          }
          description={t("aligners.ctc.description")}
          {...hoverProps("ctc")}
          stage={
            <motion.div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_at_50%_60%,rgb(52_211_153/0.45),transparent_62%)]"
              initial={false}
              animate={{
                opacity: crystalMode === "hidden" ? 0.25 : 1,
                scale: crystalMode === "hover" ? 1.15 : 1,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          }
          overlay={
            <div className="pointer-events-none absolute -top-20 left-1/2 z-10 size-60 -translate-x-1/2 select-none">
              <QuartzCanvas
                mode={crystalMode}
                spins={spins}
                reducedMotion={reducedMotion}
              />
            </div>
          }
        />
      </RadioGroup>
    </div>
  )
}

function Tile({
  value,
  selected,
  tone,
  title,
  badge,
  description,
  stage,
  overlay,
  onPointerEnter,
  onPointerLeave,
}: {
  value: Aligner
  selected: boolean
  tone?: "ctc"
  title: string
  badge?: ReactNode
  description: ReactNode
  stage: ReactNode
  overlay?: ReactNode
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const id = `aligner-${value}`
  const ctc = tone === "ctc"

  return (
    <div
      className="group/tile relative"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <label
        htmlFor={id}
        className={cn(
          "bg-card relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border p-5 transition-[border-color,box-shadow] duration-300",
          !selected && "hover:border-foreground/25",
          selected && !ctc && "border-primary",
          ctc &&
            "group-hover/tile:border-emerald-400/60 group-hover/tile:shadow-[0_24px_70px_-24px_rgb(16_185_129/0.55)]",
          ctc &&
            selected &&
            "border-emerald-400/70 shadow-[0_0_0_1px_rgb(52_211_153/0.35),0_24px_70px_-24px_rgb(16_185_129/0.55)]",
        )}
      >
        <div className="relative h-28 shrink-0">{stage}</div>
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{title}</span>
              {badge}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          </div>
          <RadioGroupItem
            value={value}
            id={id}
            className={cn(
              ctc &&
                "data-checked:border-emerald-500 data-checked:bg-emerald-500 dark:data-checked:bg-emerald-500",
            )}
          />
        </div>
      </label>
      {overlay}
    </div>
  )
}

function ShinyBadge({
  children,
  animate,
}: {
  children: ReactNode
  animate: boolean
}) {
  return (
    <motion.span
      className="rounded-full border border-emerald-400/40 bg-[linear-gradient(110deg,rgb(16_185_129/0.12)_35%,rgb(167_243_208/0.55)_50%,rgb(16_185_129/0.12)_65%)] bg-size-[250%_100%] px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
      initial={false}
      animate={animate ? { backgroundPosition: ["120% 0", "-120% 0"] } : {}}
      transition={{ duration: 2.8, ease: "linear", repeat: Infinity }}
    >
      {children}
    </motion.span>
  )
}
