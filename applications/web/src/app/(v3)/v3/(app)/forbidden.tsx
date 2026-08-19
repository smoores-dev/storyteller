import { ForbiddenContent } from "@v3/_/components/forbidden-content"
import { SiteHeader } from "@v3/_/components/site-header"

export default function Forbidden() {
  return (
    <div className="flex h-screen flex-1 flex-col">
      <SiteHeader breadcrumbs={[{ label: "Forbidden" }]} />
      <ForbiddenContent />
    </div>
  )
}
