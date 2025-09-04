import { withHasPermission } from "@/auth/auth"
import { getSetting } from "@/database/settings"

export const GET = withHasPermission("bookCreate")(async () => {
  const maxUploadChunkSize = process.env["STORYTELLER_MAX_UPLOAD_CHUNK_SIZE"]
    ? parseInt(process.env["STORYTELLER_MAX_UPLOAD_CHUNK_SIZE"], 10)
    : await getSetting("maxUploadChunkSize")

  return Response.json({
    maxUploadChunkSize,
    overriden: !!process.env["STORYTELLER_MAX_UPLOAD_CHUNK_SIZE"],
  })
})
