import { type Metadata } from "next"

import { SiteHeader } from "@v3/_/components/site-header"

export const metadata: Metadata = {
  title: "Series",
}

export default function Books() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Series" }]} />
      <div className="flex flex-1 flex-col"></div>
    </>
  )
}
