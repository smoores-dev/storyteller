"use client"

import { useState } from "react"

import { type Aligner } from "@storyteller-platform/ghost-story/constants"

import { AlignerPicker } from "@v3/_/components/settings-form/aligner-picker"
import { Button } from "@v3/_/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { useUpdateSettingsMutation } from "@/store/api"

export function CtcAlignerAnnouncement({ onDone }: { onDone: () => void }) {
  const t = useTranslation("Announcements.ctc-aligner")
  const [updateSettings, { isLoading }] = useUpdateSettingsMutation()
  const [aligner, setAligner] = useState<Aligner>("ctc")

  const switching = aligner === "ctc"

  function handleSwitch() {
    void updateSettings({ aligner: "ctc" })
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription className="flex flex-col gap-2">
          <span>{t("p1")}</span>
          <span>{t("p2")}</span>
        </DialogDescription>
      </DialogHeader>
      <AlignerPicker value={aligner} onChange={setAligner} />
      <DialogFooter>
        <Button variant={switching ? "outline" : "default"} onClick={onDone}>
          {t("keep")}
        </Button>
        <Button
          variant={switching ? "default" : "outline"}
          disabled={isLoading}
          onClick={handleSwitch}
        >
          {t("switch")}
        </Button>
      </DialogFooter>
    </>
  )
}
