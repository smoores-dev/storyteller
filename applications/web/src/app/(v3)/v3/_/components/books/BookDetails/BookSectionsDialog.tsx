"use client"

import { Reorder, motion, useDragControls } from "motion/react"
import { useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import {
  type DetailSectionKey,
  useDetailSectionLabels,
  useDetailSections,
} from "./detail-sections"

export function BookSectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("BookDetailsPage.customize")
  const c = useCommon()
  const labels = useDetailSectionLabels()
  const { order, hidden, setSections, reset, isCustomized } =
    useDetailSections()

  const visible = order.filter((key) => !hidden.includes(key))

  const reorder = (nextVisible: DetailSectionKey[]) => {
    const queue = [...nextVisible]
    const nextOrder = order.map((key) =>
      hidden.includes(key) ? key : queue.shift() ?? key,
    )

    setSections({ order: nextOrder, hidden })
  }

  const hide = (key: DetailSectionKey) => {
    setSections({ order, hidden: [...hidden, key] })
  }

  const show = (key: DetailSectionKey) => {
    setSections({ order, hidden: hidden.filter((k) => k !== key) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Reorder.Group
          axis="y"
          values={visible}
          onReorder={reorder}
          className="flex flex-col gap-1.5"
        >
          {visible.map((key) => (
            <SectionRow
              key={key}
              sectionKey={key}
              label={labels[key]}
              onHide={() => {
                hide(key)
              }}
              canHide={visible.length > 1}
            />
          ))}
        </Reorder.Group>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-[0.14em] uppercase">
            {t("hidden")}
          </span>

          {hidden.length === 0 ? (
            <div className="border-border text-muted-foreground/60 rounded-lg border border-dashed p-3 text-center text-xs">
              {t("hiddenEmpty")}
            </div>
          ) : (
            hidden.map((key) => (
              <div
                key={key}
                className="bg-muted/50 flex items-center gap-2 rounded-lg border p-2"
              >
                <span className="flex-1 truncate text-sm">{labels[key]}</span>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    show(key)
                  }}
                  title={t.plain("show")}
                >
                  <icon.Eye className="mr-1 size-3" />
                  {t("show")}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="mt-4">
          {isCustomized && (
            <Button variant="ghost" onClick={reset}>
              {t("reset")}
            </Button>
          )}

          <Button
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {c("actions.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionRow({
  sectionKey,
  label,
  onHide,
  canHide,
}: {
  sectionKey: DetailSectionKey
  label: string
  onHide: () => void
  canHide: boolean
}) {
  const t = useTranslation("BookDetailsPage.customize")
  const controls = useDragControls()
  const [isDragging, setIsDragging] = useState(false)

  return (
    <Reorder.Item
      value={sectionKey}
      dragControls={controls}
      dragListener={false}
      className={cn(
        "bg-muted flex items-center gap-2 rounded-lg border p-1.5",
        isDragging && "cursor-grabbing!",
      )}
    >
      <motion.button
        type="button"
        className={cn(
          "size-8 hover:cursor-grab",
          isDragging && "cursor-grabbing!",
        )}
        title={t.plain("move")}
        onPointerDown={(event) => {
          event.preventDefault()
          setIsDragging(true)
          controls.start(event)
        }}
        onPointerUp={() => {
          setIsDragging(false)
        }}
      >
        <icon.GripVertical className="text-muted-foreground size-4 shrink-0" />
      </motion.button>

      <span className="flex-1 truncate text-sm font-medium">{label}</span>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onHide}
        disabled={!canHide}
        className={cn(!canHide && "invisible")}
        title={t.plain("hide")}
      >
        <icon.EyeOff className="size-4" />
      </Button>
    </Reorder.Item>
  )
}
