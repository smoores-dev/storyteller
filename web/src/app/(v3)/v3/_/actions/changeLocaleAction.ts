"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { type Locale } from "next-intl"

import { LOCALE_COOKIE_NAME } from "@/i18n/constants"

export async function changeLocaleAction(locale: Locale) {
  // don't need to check permissions, it will only affect the current user
  const store = await cookies()
  store.set(LOCALE_COOKIE_NAME, locale)

  revalidatePath("/v3", "layout")
}
