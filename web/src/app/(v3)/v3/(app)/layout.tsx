import { cookies } from "next/headers"

import { type User } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"

import { AppSidebar } from "@v3/_/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@v3/_/components/ui/sidebar"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await fetchApiRoute<User>("/user")

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 56)",
          "--header-height": "calc(var(--spacing) * 12)",
          "--sidebar-width-icon": "calc(var(--spacing) * 10)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
