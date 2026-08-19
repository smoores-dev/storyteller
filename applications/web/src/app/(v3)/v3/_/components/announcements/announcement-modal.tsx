"use client"

import { useMessages } from "next-intl"
import { useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Announcement } from "@/announcement-builtins"
import { useDismissAnnouncementMutation } from "@/store/api"

type AnnouncementMessage = { title: string } & Record<string, string>

export function AnnouncementModal({ pending }: { pending: Announcement[] }) {
  const [dismissAnnouncement] = useDismissAnnouncementMutation()
  const t = useTranslation("Announcements")
  const messages = useMessages() as unknown as {
    Announcements?: Record<string, AnnouncementMessage>
  }

  const [index, setIndex] = useState(0)
  const announcement = pending[index]

  if (!announcement) return null

  const activeKey = announcement.key
  const content = messages.Announcements?.[activeKey]
  if (!content) return null

  const paragraphs = Object.keys(content)
    .filter((key) => /^p\d+$/.test(key))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((key) => content[key])

  function handleDismiss() {
    void dismissAnnouncement({ key: activeKey })
    setIndex((current) => current + 1)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
        </DialogHeader>
        <div className="text-muted-foreground flex flex-col gap-2 text-xs/relaxed">
          {paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={handleDismiss}>{t("dismiss")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
