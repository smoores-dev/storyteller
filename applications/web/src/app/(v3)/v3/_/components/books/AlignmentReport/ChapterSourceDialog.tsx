"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { useState } from "react"

import { DynamicCode } from "@v3/_/components/code/DynamicCode"
import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@v3/_/components/ui/tabs"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { useGetBookMediaOverlayQuery } from "@/store/api"
import { type UUID } from "@/uuid"

const FRAME =
  "max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs break-words whitespace-pre-wrap"

export function ChapterSourceDialog({
  bookUuid,
  href,
  xhtml,
  open,
  onOpenChange,
}: {
  bookUuid: UUID
  href: string
  xhtml: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("AlignmentReport")
  const [source, setSource] = useState<"xhtml" | "overlay">("xhtml")
  const [copied, setCopied] = useState(false)
  const overlay = useGetBookMediaOverlayQuery(
    open ? { bookUuid, href } : skipToken,
  )
  const shown = source === "xhtml" ? xhtml : overlay.currentData

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("detail.sourceTitle")}</DialogTitle>
          <DialogDescription>{t("detail.sourceDescription")}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={source}
          onValueChange={(value) => {
            setSource(value === "overlay" ? "overlay" : "xhtml")
          }}
        >
          <TabsList>
            <TabsTrigger value="xhtml">{t("detail.xhtml")}</TabsTrigger>
            <TabsTrigger value="overlay">{t("detail.mediaOverlay")}</TabsTrigger>
          </TabsList>
          <TabsContent value="xhtml">
            <div className={FRAME}>
              <DynamicCode code={xhtml} language="html" />
            </div>
          </TabsContent>
          <TabsContent value="overlay">
            {overlay.isFetching ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {t("detail.readingSource")}
              </p>
            ) : overlay.error ? (
              <p className="text-destructive py-8 text-center text-sm">
                {"status" in overlay.error && overlay.error.status === 404
                  ? t("detail.noOverlay")
                  : t("detail.overlayUnavailable")}
              </p>
            ) : (
              <div className={FRAME}>
                <DynamicCode code={overlay.currentData ?? ""} language="xml" />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {!!shown && (
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(shown).then(() => {
                  setCopied(true)
                  setTimeout(() => {
                    setCopied(false)
                  }, 1500)
                })
              }}
            >
              {copied ? (
                <icon.Check className="size-3.5" />
              ) : (
                <icon.Copy className="size-3.5" />
              )}
              {t("detail.copy")}
            </Button>
          )}

          <Button
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t("detail.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
