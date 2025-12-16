import type { ReactNode } from "react"

import type { User } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { StorytellerAppShell } from "@/components/StorytellerAppShell"
import { MiniPlayer } from "@/components/reader/MiniPlayer/MiniPlayer"
import type { CollectionWithRelations } from "@/database/collections"
import { env } from "@/env"
import { getCurrentVersion } from "@/versions"

interface Props {
  children: ReactNode
}

export default async function DashboardLayout({ children }: Props) {
  const version = getCurrentVersion()
  let currentUser: User | undefined
  try {
    currentUser = await fetchApiRoute<User | undefined>("/user")
  } catch {
    // pass
  }

  let collections: CollectionWithRelations[] = []
  try {
    collections = await fetchApiRoute<CollectionWithRelations[]>("/collections")
  } catch {
    // pass
  }
  const hideReader = !env.ENABLE_WEB_READER

  return (
    <StorytellerAppShell
      version={version}
      currentUser={currentUser}
      collections={collections}
      demoMode={!!env.STORYTELLER_DEMO_MODE}
    >
      {children}
      {!hideReader && <MiniPlayer />}
    </StorytellerAppShell>
  )
}
