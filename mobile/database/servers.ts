import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { deleteBooksFromServer } from "./books"
import { db } from "./db"
import { type DB } from "./schema"

export type NewServer = Insertable<DB["server"]>
export type Server = Selectable<DB["server"]>
export type ServerUpdate = Updateable<DB["server"]>

export async function createServer(server: NewServer) {
  await db.insertInto("server").values(server).execute()

  return await db
    .selectFrom("server")
    .selectAll()
    .where("uuid", "=", server.uuid)
    .executeTakeFirstOrThrow()
}

export async function getServers() {
  return await db.selectFrom("server").selectAll().execute()
}

export async function getServer(uuid: UUID) {
  return await db
    .selectFrom("server")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function getServerByUrl(url: string) {
  return await db
    .selectFrom("server")
    .selectAll()
    .where("baseUrl", "=", url)
    .executeTakeFirst()
}

export async function deleteServer(uuid: UUID) {
  return await db.transaction().execute(async (tr) => {
    const downloaded = await deleteBooksFromServer(uuid, tr)
    const server = await tr
      .selectFrom("server")
      .selectAll()
      .where("uuid", "=", uuid)
      .executeTakeFirstOrThrow()
    await tr.deleteFrom("server").where("uuid", "=", uuid).execute()
    return { downloadedBooks: downloaded, server }
  })
}

export async function updateServer(uuid: UUID, update: ServerUpdate) {
  await db.updateTable("server").set(update).where("uuid", "=", uuid).execute()
}
