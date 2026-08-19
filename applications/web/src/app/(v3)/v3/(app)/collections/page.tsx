import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { CollectionsPageClient } from "./collectionsPageClient"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CollectionsPage")
  return {
    title: t("title"),
  }
}

export default withPageAuth(["bookList"])(() => {
  return <CollectionsPageClient />
})
