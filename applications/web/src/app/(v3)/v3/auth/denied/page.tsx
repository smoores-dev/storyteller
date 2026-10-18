import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AuthDeniedPage")
  return {
    title: t("title"),
  }
}

export default async function AuthDeniedPage() {
  const t = await getTranslations("AuthDeniedPage")

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <img
          src="/Storyteller_Logo.png"
          alt="Storyteller Logo"
          width={100}
          height={100}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-balance">
            {t("description")}
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<V3Link href="/login">{t("backToLogin")}</V3Link>}
        />
      </div>
    </div>
  )
}
