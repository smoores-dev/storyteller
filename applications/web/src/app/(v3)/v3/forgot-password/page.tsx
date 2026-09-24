import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getSettings } from "@/database/settings"
import { env } from "@/env"
import { requestPasswordReset } from "@/passwordReset"

import {
  ForgotPasswordForm,
  type ForgotPasswordFormData,
} from "./ForgotPasswordForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ForgotPasswordPage")
  return {
    title: t("title"),
  }
}

export default async function ForgotPasswordPage() {
  const settings = await getSettings()

  if (!settings.smtpHost || settings.disablePasswordLogin) {
    const basePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"
    redirect(`${basePath}/login`)
  }

  async function requestReset(data: ForgotPasswordFormData) {
    "use server"

    if (env.STORYTELLER_DEMO_MODE) return

    const { usernameOrEmail } = data
    if (!usernameOrEmail) return

    const currentSettings = await getSettings()
    if (!currentSettings.smtpHost || currentSettings.disablePasswordLogin) {
      return
    }

    await requestPasswordReset(usernameOrEmail)
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <ForgotPasswordForm requestResetAction={requestReset} />
      </div>
    </div>
  )
}
