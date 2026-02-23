import { type Metadata } from "next"

import { SiteHeader } from "@v3/_/components/site-header"

export const metadata: Metadata = {
  title: "Collections",
}

export default function Books() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Collections" }]} />
      <div className="flex flex-1 flex-col"></div>
    </>
  )
}
