"use client"

import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"

export const PROVIDERS_SETTINGS_HREF =
  "/settings?tab=metadata&section=metadataProviders"

export function MetadataUnavailable() {
  const t = useTranslation("BookDetailsPage.metadataProviders")

  return (
    <div className="text-muted-foreground flex max-w-sm flex-col items-center gap-2 text-center text-sm">
      <icon.AlertTriangle className="size-5" />
      <p className="text-foreground font-medium">{t("unavailableTitle")}</p>
      <p>{t("unavailableDescription")}</p>
    </div>
  )
}

export function HardcoverTokenHint() {
  const t = useTranslation("BookDetailsPage.metadataProviders")

  return (
    <p className="text-muted-foreground text-sm">
      {t.rich("noToken", {
        link: (chunks) => (
          <V3Link
            href={PROVIDERS_SETTINGS_HREF}
            className="text-primary underline-offset-2 hover:underline"
          >
            {chunks}
          </V3Link>
        ),
      })}
    </p>
  )
}

export function providerErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data
  ) {
    return String(error.data.code)
  }
  return null
}

export function ProviderSearchError({
  code,
  provider,
}: {
  code: string
  provider: string
}) {
  const t = useTranslation("BookDetailsPage.metadataProviders")

  if (code === "noToken") return <HardcoverTokenHint />

  return (
    <p className="text-muted-foreground text-sm">
      {code === "unauthorized"
        ? t("tokenRejected")
        : code === "rateLimited"
          ? t("rateLimited", { provider })
          : t("searchFailed", { provider })}
    </p>
  )
}
