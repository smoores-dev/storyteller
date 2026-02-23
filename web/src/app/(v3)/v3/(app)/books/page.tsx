import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { SiteHeader } from "@v3/_/components/site-header"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BooksPage")
  return {
    title: t("title"),
  }
}

export default async function Books() {
  const t = await getTranslations("BooksPage")
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: t("title") }]} />
      <div className="flex flex-1 flex-col"></div>
    </>
  )
}
