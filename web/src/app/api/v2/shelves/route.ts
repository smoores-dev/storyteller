import { withHasPermission } from "@/auth/auth"
import {
  getCurrentlyReading,
  getNextUp,
  getRecentlyAdded,
  getStartReading,
} from "@/database/shelves"

export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user

  const currentlyReading = await getCurrentlyReading(user.id)
  const nextUp = await getNextUp(user.id)
  const recentlyAdded = await getRecentlyAdded(user.id)
  const startReading = await getStartReading(user.id)

  return Response.json({
    currentlyReading,
    nextUp,
    recentlyAdded,
    startReading,
  })
})
