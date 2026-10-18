import { type Metadata } from "next"
import { AuthError } from "next-auth"
import { getTranslations } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { apiHost } from "@/app/apiHost"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { getCurrentUser, nextAuth } from "@/auth/auth"
import { type PublicProvider } from "@/auth/providers"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { getPreferenceDefaults, getSettings } from "@/database/settings"
import { getUsers } from "@/database/users"

import { LoginForm, type LoginFormData } from "./LoginForm"

function localCallbackUrl(url: string | undefined): string | null {
  if (!url?.startsWith("/")) {
    return null
  }

  if (url.startsWith("//") || url.startsWith("/\\")) {
    return null
  }

  return url
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LoginPage")
  return {
    title: t("title"),
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const [users, settings] = await Promise.all([getUsers(), getSettings()])

  if (users.length === 0) {
    redirect("/v3/init")
  }

  const currentUser = await getCurrentUser()
  if (currentUser) {
    const { callbackUrl } = await searchParams
    const basePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"
    redirect(localCallbackUrl(callbackUrl) ?? (basePath || "/"))
  }

  async function credentialsLogin(data: LoginFormData, callbackUrl?: string) {
    "use server"

    try {
      const usernameOrEmail = data.usernameOrEmail
      const password = data.password
      if (!usernameOrEmail || !password) return "failed"

      const cookieOrigin = (await headers()).get("Origin")

      const secure = getCookieSecure(cookieOrigin)
      const domain = getCookieDomain(cookieOrigin)

      const formData = new FormData()
      formData.set("usernameOrEmail", usernameOrEmail)
      formData.set("password", password)

      const url = new URL(`/api/v2/token`, apiHost)

      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 401) {
          return "bad-creds"
        }
        return "failed"
      }

      const token = (await response.json()) as {
        access_token: string
        expires_in: number
        token_type: string
      }

      const cookieStore = await cookies()
      cookieStore.set("st_token", token.access_token, {
        secure,
        domain: domain,
        sameSite: "lax",
        httpOnly: true,
        expires: token.expires_in,
      })
    } catch {
      return "failed"
    }

    const reqHeaders = await headers()
    const basePath = reqHeaders.get("x-v3-rewritten") === "1" ? "" : "/v3"

    redirect(localCallbackUrl(callbackUrl) ?? (basePath || "/"))
  }

  async function oauthLogin(providerId: string, callbackUrl?: string) {
    "use server"
    const basePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"
    try {
      await nextAuth.signIn(providerId, {
        redirectTo: callbackUrl ?? (basePath || "/"),
      })
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(error)
        return
      }
      throw error
    }
  }

  const pref = await getPreferenceDefaults()
  const accentColor = pref.accentColor

  const { credentials: _, ...providers } =
    await fetchApiRoute<Record<string, PublicProvider>>("/auth/providers")

  return (
    <div
      className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10"
      style={
        accentColor
          ? ({ "--primary": accentColor } as React.CSSProperties)
          : undefined
      }
    >
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm
          oauthLoginAction={oauthLogin}
          providers={Object.values(providers)}
          credentialsLoginAction={credentialsLogin}
          disablePasswordLogin={settings.disablePasswordLogin}
          showPasswordReset={
            !!settings.smtpHost && !settings.disablePasswordLogin
          }
        />
      </div>
    </div>
  )
}
