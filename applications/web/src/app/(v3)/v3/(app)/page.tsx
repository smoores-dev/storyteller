import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { assertAuthenticatedUser } from "@/auth/auth"
import { ensureHomeSectionDefaults, getHomeSections } from "@/database/shelves"

import { HomePage } from "./HomePage"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HomePage")
  return {
    title: t("title"),
  }
}

export default async function Index() {
  const user = await assertAuthenticatedUser()
  await ensureHomeSectionDefaults(user.id)
  const sections = await getHomeSections(user.id)

  return <HomePage initialSections={sections} />
}
