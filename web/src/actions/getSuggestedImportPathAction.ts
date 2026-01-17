"use server"

import { dirname, resolve } from "node:path"

import { hasPermission, nextAuth } from "@/auth/auth"
import { db } from "@/database/connection"
import { getSettings } from "@/database/settings"
import { ASSETS_DIR, DATA_DIR } from "@/directories"

type SuggestedImportPathResult = {
  suggestedPath: string
  source: "lastBook" | "dataDir"
  dataDir: string
}

const escapeLike = (s: string) => s.replace(/[%_]/g, "\\$&")

export async function getSuggestedImportPathAction(): Promise<SuggestedImportPathResult> {
  const session = await nextAuth.auth()
  if (!hasPermission("bookCreate", session?.user)) {
    throw new Error("Forbidden")
  }

  const dataDir = DATA_DIR.replace(/([^/])$/, "$1/")
  const assetsDir = ASSETS_DIR.replace(/([^/])$/, "$1/")

  const settings = await getSettings()
  const collections = await db
    .selectFrom("collection")
    .select(["importPath"])
    .where("importPath", "is not", null)
    .execute()

  const resolvedAssetsDir = resolve(assetsDir)

  const excludedPaths = [
    ASSETS_DIR,
    resolvedAssetsDir,
    settings.importPath,
    ...collections.map((c) => c.importPath),
  ].filter((p): p is string => p !== null)

  const recentBook = await db
    .selectFrom("book")
    .leftJoin("ebook", "ebook.bookUuid", "book.uuid")
    .leftJoin("audiobook", "audiobook.bookUuid", "book.uuid")
    .leftJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .select([
      "ebook.filepath as ebookPath",
      "audiobook.filepath as audiobookPath",
      "readaloud.filepath as readaloudPath",
      "book.createdAt",
    ])
    .where((eb) => {
      const notExcluded = (
        column: "ebook.filepath" | "audiobook.filepath" | "readaloud.filepath",
      ) =>
        eb.and([
          eb(column, "is not", null),
          ...excludedPaths.map((excluded) =>
            eb.not(eb(column, "like", `${escapeLike(excluded)}%`)),
          ),
        ])

      return eb.or([
        notExcluded("ebook.filepath"),
        notExcluded("audiobook.filepath"),
        notExcluded("readaloud.filepath"),
      ])
    })
    .orderBy("book.createdAt", "desc")
    .limit(1)
    .executeTakeFirst()

  const bookPath =
    recentBook?.ebookPath ||
    recentBook?.audiobookPath ||
    recentBook?.readaloudPath

  const suggestedPath = bookPath ? `${dirname(bookPath)}/` : dataDir

  return { suggestedPath, source: "lastBook", dataDir }
}
