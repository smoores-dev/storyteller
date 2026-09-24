import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { hashPassword } from "@/auth/auth"
import { updateUserByEmail } from "@/database/users"
import { consumePasswordResetToken } from "@/passwordReset"

import {
  ResetPasswordForm,
  type ResetPasswordFormData,
} from "./ResetPasswordForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ResetPasswordPage")
  return {
    title: t("title"),
  }
}

export default async function ResetPasswordPage(props: {
  params: Promise<{ token: string }>
}) {
  const { token } = await props.params

  async function resetPassword(data: ResetPasswordFormData) {
    "use server"

    const { password } = data
    if (!password) return

    const basePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"

    const result = await consumePasswordResetToken(token)
    if (!result) redirect(`${basePath}/login?error=reset-invalid`)

    const hashedPassword = await hashPassword(password)
    await updateUserByEmail(result.email, { hashedPassword })

    redirect(`${basePath}/login?reset=success`)
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <ResetPasswordForm resetPasswordAction={resetPassword} />
      </div>
    </div>
  )
}
