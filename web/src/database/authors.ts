import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { getDatabase } from "./connection"

export type Author = Selectable<DB["author"]>
export type NewAuthor = Insertable<DB["author"]>
export type AuthorUpdate = Updateable<DB["author"]>

export async function getAuthors() {
  const db = getDatabase()

  return db.selectFrom("author").selectAll().execute()
}
