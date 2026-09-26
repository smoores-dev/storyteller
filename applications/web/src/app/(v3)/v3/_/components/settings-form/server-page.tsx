"use client"

import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"

import { UpdatesSection } from "./app-tab"
import { AuthenticationSection } from "./auth-tab"
import { EmailSection } from "./email-tab"
import { ServerIdentitySection } from "./identity-tab"
import { OpdsSection } from "./opds-tab"
import { UploadSection } from "./upload-tab"

export function ServerPage({
  maxUploadChunkSize,
}: {
  maxUploadChunkSize: { overriden: boolean } | undefined
}) {
  const isTauri = useIsTauri()

  return (
    <div className="space-y-6">
      <ServerIdentitySection />
      <AuthenticationSection />
      {!isTauri && <UploadSection maxUploadChunkSize={maxUploadChunkSize} />}
      <EmailSection />
      <OpdsSection />
      {isTauri && <UpdatesSection />}
    </div>
  )
}
