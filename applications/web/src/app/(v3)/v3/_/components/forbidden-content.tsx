"use client"

import { useRouter } from "next/navigation"

import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"

export function ForbiddenContent() {
  const router = useRouter()
  const t = useTranslation("ForbiddenPage")

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-primary font-heading text-7xl leading-none font-normal">
          403
        </p>
        <h1 className="font-heading text-2xl font-normal">{t("title")}</h1>
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          {t("description")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            router.back()
          }}
        >
          <icon.ArrowLeft className="mr-1 size-4" />
          {t("goBack")}
        </Button>

        <Button
          nativeButton={false}
          render={
            <V3Link href="/">
              <icon.Home className="mr-1 size-4" />
              {t("home")}
            </V3Link>
          }
        />
      </div>
    </div>
  )
}
