import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { ShelvesPageClient } from "./shelvesPageClient"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ShelvesPage")
  return {
    title: t("title"),
  }
}

export default withPageAuth<{
  searchParams: Promise<{ initialShelfUuid?: string }>
}>(["bookList"])(async ({ searchParams }) => {
  const initialShelfUuid = (await searchParams).initialShelfUuid

  return <ShelvesPageClient initialShelfUuid={initialShelfUuid} />
})
