import { BookDetail } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { CollectionDetails } from "@/components/collections/CollectionDetails"
import { Collection, CollectionWithRelations } from "@/database/collections"
import { UUID } from "@/uuid"

interface Props {
  params: Promise<{ uuid: UUID | "none" }>
}

export default async function CollectionPage({ params }: Props) {
  const { uuid } = await params

  const collection =
    uuid === "none"
      ? null
      : await fetchApiRoute<Collection>(`/collections/${uuid}`)
  const books = await fetchApiRoute<BookDetail[]>("/books")
  const collections =
    await fetchApiRoute<CollectionWithRelations[]>("/collections")

  return (
    <CollectionDetails
      collectionUuid={collection?.uuid ?? null}
      books={books}
      collections={collections}
    />
  )
}
