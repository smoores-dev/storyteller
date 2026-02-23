import { type Metadata } from "next"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { AuthError } from "next-auth"

import { apiHost } from "@/app/apiHost"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { createConfig, nextAuth } from "@/auth/auth"
import { type PublicProvider } from "@/auth/providers"
import { getCookieDomain, getCookieSecure } from "@/cookies"

import { LoginForm, type LoginFormData } from "./LoginForm"

function defaultRedirectCallback({
  url,
  baseUrl,
}: {
  url: string
  baseUrl: string
}) {
  if (url.startsWith("/")) return `${baseUrl}${url}`
  else if (new URL(url).origin === baseUrl) return url
  return baseUrl
}

export const metadata: Metadata = {
  title: "Login",
}

export default async function LoginPage() {
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

    if (!callbackUrl) {
      redirect("/v3")
    }

    const cookieOrigin = (await headers()).get("Origin")

    const domain = getCookieDomain(cookieOrigin)
    const config = await createConfig(undefined)
    const callbacks = config.callbacks

    const redirectCallback = callbacks?.redirect ?? defaultRedirectCallback
    const isValidRedirect = redirectCallback({
      url: callbackUrl,
      baseUrl: config.cookies?.sessionToken?.options?.domain ?? domain ?? "",
    })

    if (isValidRedirect) {
      redirect(callbackUrl)
    }

    redirect("/v3")
  }

  async function oauthLogin(providerId: string, callbackUrl?: string) {
    "use server"
    try {
      await nextAuth.signIn(
        providerId,
        callbackUrl === undefined ? callbackUrl : { redirectTo: callbackUrl },
      )
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(error)
        return
      }
      throw error
    }
  }

  const { credentials: _, ...providers } =
    await fetchApiRoute<Record<string, PublicProvider>>("/auth/providers")

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm
          oauthLoginAction={oauthLogin}
          providers={Object.values(providers)}
          credentialsLoginAction={credentialsLogin}
        />
      </div>
    </div>
  )
}
