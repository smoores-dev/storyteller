import { type Metadata } from "next"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { nextAuth } from "@/auth/auth"
import { getCollection } from "@/database/collections"
import { type UUID } from "@/uuid"

import { CollectionStandalonePage } from "./collectionStandaloneClient"

type CollectionPageProps = {
  params: Promise<{ uuid: UUID }>
}

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ uuid: UUID }>
}): Promise<Metadata> => {
  const { uuid } = await params
  const session = await nextAuth.auth()
  if (!session?.user) {
    return {
      title: "Collection",
    }
  }
  const collection = await getCollection(uuid, session.user.id)
  return {
    title: collection.name,
  }
}

export default withPageAuth<CollectionPageProps>(["bookList"])(
  async function CollectionPage({ params }) {
    const { uuid } = await params
    return <CollectionStandalonePage collectionUuid={uuid} />
  },
)
