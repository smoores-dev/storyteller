import { type ReactNode } from "react"

import { type User } from "@/apiModels"
import { StorytellerAppShell } from "@/components/StorytellerAppShell"
import { MiniPlayer } from "@/components/reader/MiniPlayer"
import { type CollectionWithRelations } from "@/database/collections"
import { getCurrentVersion } from "@/versions"

import { fetchApiRoute } from "../fetchApiRoute"

interface Props {
  children: ReactNode
}

export default async function DashboardLayout({ children }: Props) {
  const version = getCurrentVersion()
  let currentUser: User | undefined = undefined
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
  const hideReader = !process.env["ENABLE_WEB_READER"]

  return (
    <StorytellerAppShell
      version={version}
      currentUser={currentUser}
      collections={collections}
      demoMode={!!process.env["STORYTELLER_DEMO_MODE"]}
    >
      {children}
      {!hideReader && <MiniPlayer />}
    </StorytellerAppShell>
  )
}
