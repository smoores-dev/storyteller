import { fetchApiRoute } from "@/app/fetchApiRoute"
import { CollectionDetails } from "@/components/collections/CollectionDetails"
import { Collection } from "@/database/collections"
import { UUID } from "@/uuid"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ uuid: UUID | "none" }>
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { uuid } = await params
  const collection =
    uuid === "none"
      ? null
      : await fetchApiRoute<Collection>(`/collections/${uuid}`)
  return {
    title: collection ? `${collection.name} | Collections` : "Uncollected",
  }
}

export default async function CollectionPage({ params }: Props) {
  const { uuid } = await params

  const collection =
    uuid === "none"
      ? null
      : await fetchApiRoute<Collection>(`/collections/${uuid}`)

  return <CollectionDetails collectionUuid={collection?.uuid ?? null} />
}
