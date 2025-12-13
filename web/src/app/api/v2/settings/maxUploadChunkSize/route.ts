import { withHasPermission } from "@/auth/auth"
import { getSetting } from "@/database/settings"
import { env } from "@/env"

export const GET = withHasPermission("bookCreate")(async () => {
  const maxUploadChunkSize =
    env.STORYTELLER_MAX_UPLOAD_CHUNK_SIZE ??
    (await getSetting("maxUploadChunkSize"))

  return Response.json({
    maxUploadChunkSize,
    overriden: !!env.STORYTELLER_MAX_UPLOAD_CHUNK_SIZE,
  })
})
