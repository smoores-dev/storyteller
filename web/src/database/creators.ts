import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { UUID } from "@/uuid"

export type Creator = Selectable<DB["creator"]>
export type NewCreator = Insertable<DB["creator"]>
export type CreatorUpdate = Updateable<DB["creator"]>

export async function getCreators(userId?: UUID, role?: string | undefined) {
  return db
    .selectFrom("creator")
    .$if(!!role, (qb) =>
      qb
        .innerJoin(
          "bookToCreator as roleCheck",
          "roleCheck.creatorUuid",
          "creator.uuid",
        )
        // The $if condition ensures that this only runs when role
        // is not null
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .where("roleCheck.role", "=", role!),
    )
    .$if(!!userId, (qb) =>
      qb
        .innerJoin("bookToCreator", "bookToCreator.creatorUuid", "creator.uuid")
        .leftJoin(
          "bookToCollection",
          "bookToCreator.bookUuid",
          "bookToCollection.bookUuid",
        )
        .leftJoin(
          "collection",
          "collection.uuid",
          "bookToCollection.collectionUuid",
        )
        .leftJoin(
          "collectionToUser",
          "collectionToUser.collectionUuid",
          "bookToCollection.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // The $if condition ensures that this only runs when userId
            // is not null
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
            eb("collection.public", "is", null),
          ]),
        ),
    )
    .groupBy("creator.uuid")
    .selectAll("creator")
    .execute()
}
