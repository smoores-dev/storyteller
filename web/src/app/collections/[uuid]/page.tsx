import { type Metadata } from "next"

import { fetchApiRoute } from "@/app/fetchApiRoute"
import { CollectionDetails } from "@/components/collections/CollectionDetails"
import { type Collection } from "@/database/collections"
import { type UUID } from "@/uuid"

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

  return (
    <CollectionDetails
      name={collection?.name ?? null}
      description={collection?.description ?? null}
      collectionUuid={collection?.uuid ?? null}
    />
  )
}
