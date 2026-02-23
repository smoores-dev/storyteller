import { type Metadata } from "next"

import { SiteHeader } from "@v3/_/components/site-header"

export const metadata: Metadata = {
  title: "Books",
}

export default function Books() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Books" }]} />
      <div className="flex flex-1 flex-col"></div>
    </>
  )
}
