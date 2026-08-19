import { NotFoundContent } from "@v3/_/components/not-found-content"
import { SiteHeader } from "@v3/_/components/site-header"

export default function NotFound() {
  return (
    <div className="flex h-screen flex-1 flex-col">
      <SiteHeader breadcrumbs={[{ label: "Not found" }]} />
      <NotFoundContent />
    </div>
  )
}
