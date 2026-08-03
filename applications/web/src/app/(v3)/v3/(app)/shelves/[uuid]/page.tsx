import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { nextAuth } from "@/auth/auth"
import { getShelfBare } from "@/database/shelves"
import { type UUID } from "@/uuid"

import { ShelfPageClient } from "./shelfPageClient"

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ uuid: UUID }>
}) => {
  const { uuid } = await params
  const session = await nextAuth.auth()
  if (!session?.user) {
    return {
      title: "Shelf",
    }
  }

  const shelf = await getShelfBare(uuid, session.user.id)
  return {
    title: shelf.name,
  }
}

type ShelfPageProps = {
  params: Promise<{ uuid: UUID }>
}

export default withPageAuth<ShelfPageProps>(["bookList"])(
  async function ShelfPage({ params }) {
    const { uuid } = await params
    return <ShelfPageClient shelfUuid={uuid} />
  },
)
