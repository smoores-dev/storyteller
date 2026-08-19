"use client"

import { ShelfManager } from "@v3/_/components/shelves"
import { Button } from "@v3/_/components/ui/button"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"

export function AddSectionSection() {
  const t = useTranslation("HomePage")

  return (
    <ShelfManager
      trigger={
        <Button
          variant="outline"
          className="text-muted-foreground w-full border-dashed"
        >
          <icon.Add className="mr-2 size-4" />
          {t("addSection.label")}
        </Button>
      }
    />
  )
}
