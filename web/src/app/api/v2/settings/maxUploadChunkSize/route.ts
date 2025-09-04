import { withHasPermission } from "@/auth/auth"
import { getSetting } from "@/database/settings"

export const GET = withHasPermission("bookCreate")(async () => {
  const maxUploadChunkSize = await getSetting("maxUploadChunkSize")

  return Response.json({ maxUploadChunkSize })
})
