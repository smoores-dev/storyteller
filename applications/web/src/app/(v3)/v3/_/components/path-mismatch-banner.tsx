"use client"

import { useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"

export function PathMismatchBanner({
  anchor,
  currentDataDir,
}: {
  anchor: string
  currentDataDir: string
}) {
  const t = useTranslation("SettingsPage.tabs.backups")
  const [hidden, setHidden] = useState(false)

  if (hidden) return null

  return (
    <div className="flex items-start gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <icon.AlertTriangle
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <p className="min-w-0 flex-1">
        {t("anchorMismatch", { anchor, current: currentDataDir })}{" "}
        <V3Link
          className="font-medium underline"
          href={`/settings?tab=backups&from=${encodeURIComponent(anchor)}&to=${encodeURIComponent(currentDataDir)}`}
        >
          {t("rewriteTitle")}
        </V3Link>
      </p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("dismissAnchor")}
        onClick={() => {
          setHidden(true)
        }}
      >
        <icon.Close aria-hidden />
      </Button>
    </div>
  )
}
