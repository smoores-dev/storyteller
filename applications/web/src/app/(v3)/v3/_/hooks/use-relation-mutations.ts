import { useMemo } from "react"

import { type Role } from "@/metadata/marcRelators"
import {
  useAddBooksToCollectionsMutation,
  useAddBooksToSeriesMutation,
  useAddCreatorsToBooksMutation,
  useAddTagsToBooksMutation,
  useRemoveBooksFromCollectionsMutation,
  useRemoveBooksFromSeriesMutation,
  useRemoveCreatorsFromBooksMutation,
  useRemoveTagsFromBooksMutation,
  useUpdateReadingStatusMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { type RelationItem, type RelationSource } from "./use-relation-items"

export type RelationEditActions = {
  add: (bookUuids: UUID[], item: RelationItem) => void
  remove: (bookUuids: UUID[], itemUuid: UUID) => void
  singleSelect: boolean
  createAndAdd?: (bookUuids: UUID[], name: string) => void
}

export function useRelationEditActions(
  source: RelationSource,
): RelationEditActions {
  const [addTags] = useAddTagsToBooksMutation()
  const [removeTags] = useRemoveTagsFromBooksMutation()
  const [addToCollections] = useAddBooksToCollectionsMutation()
  const [removeFromCollections] = useRemoveBooksFromCollectionsMutation()
  const [addToSeries] = useAddBooksToSeriesMutation()
  const [removeFromSeries] = useRemoveBooksFromSeriesMutation()
  const [updateReadingStatus] = useUpdateReadingStatusMutation()
  const [addCreators] = useAddCreatorsToBooksMutation()
  const [removeCreators] = useRemoveCreatorsFromBooksMutation()

  return useMemo<RelationEditActions>(() => {
    const creatorRole = (role: Role): RelationEditActions => ({
      add: (books, item) => {
        void addCreators({
          creators: [{ uuid: item.uuid as UUID }],
          books,
          role,
        })
      },
      remove: (books, uuid) => {
        void removeCreators({ creators: [uuid], books, role })
      },
      createAndAdd: (books, name) => {
        void addCreators({ creators: [{ name }], books, role })
      },
      singleSelect: false,
    })

    switch (source) {
      case "tags":
        return {
          add: (books, item) => {
            void addTags({ tags: [{ uuid: item.uuid as UUID }], books })
          },
          remove: (books, uuid) => {
            void removeTags({ tags: [uuid], books })
          },
          singleSelect: false,
        }
      case "collections":
        return {
          add: (books, item) => {
            void addToCollections({
              collections: [item.uuid as UUID],
              books,
            })
          },
          remove: (books, uuid) => {
            void removeFromCollections({ collections: [uuid], books })
          },
          singleSelect: false,
        }
      case "series":
        return {
          add: (books, item) => {
            void addToSeries({
              series: { uuid: item.uuid as UUID, name: item.name },
              relations: books.map((bookUuid, index) => ({
                bookUuid,
                position: index + 1,
                featured: false,
              })),
            })
          },
          remove: (books, uuid) => {
            void removeFromSeries({ series: [uuid], books })
          },
          singleSelect: false,
        }
      case "statuses":
        return {
          add: (books, item) => {
            void updateReadingStatus({ status: item.uuid as UUID, books })
          },
          remove: () => {},
          singleSelect: true,
        }
      case "authors":
        return creatorRole("aut")
      case "narrators":
        return creatorRole("nrt")
      case "translators":
        return creatorRole("trl")
      case "creators":
      case "distinct":
      case "identifiers":
        return {
          add: () => {},
          remove: () => {},
          singleSelect: false,
        }
      default: {
        const _exhaustive: never = source
        return {
          add: () => {},
          remove: () => {},
          singleSelect: false,
        }
      }
    }
  }, [
    source,
    addTags,
    removeTags,
    addToCollections,
    removeFromCollections,
    addToSeries,
    removeFromSeries,
    updateReadingStatus,
    addCreators,
    removeCreators,
  ])
}
