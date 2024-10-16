import AsyncStorage from "@react-native-async-storage/async-storage"
import { exists } from "../../exists"
import { BookDetail } from "../../apiModels"
import {
  ReadiumLocator,
  TimestampedLocator,
} from "../../modules/readium/src/Readium.types"
import { BookshelfBook, Highlight } from "../slices/bookshelfSlice"
import { areLocatorsEqual } from "../../modules/readium"
import type { UUID } from "crypto"

export type Book = BookDetail & { downloaded?: boolean }

export type Location = {
  id: number
  cfi: string
}

export async function readBookIds(): Promise<null | number[]> {
  const stored = await AsyncStorage.getItem("books")
  if (!stored) return null

  return JSON.parse(stored)
}

export async function readLocators(
  books: BookshelfBook[],
): Promise<Record<string, TimestampedLocator>> {
  const entryPromises = books.map(
    async ({ id }) =>
      [id, await AsyncStorage.getItem(`books.${id}.locator`)] as const,
  )

  const entries = await Promise.all(entryPromises)
  const locators = Object.fromEntries(
    entries
      .filter(([, locator]) => exists(locator))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map(([id, locator]) => [
        id,
        JSON.parse(locator!) as ReadiumLocator | TimestampedLocator,
      ]),
  )

  // Ensure that all locators are timestamped
  for (const [id, locator] of Object.entries(locators)) {
    if ("timestamp" in locator) continue
    const timestamped = { timestamp: Date.now(), locator }
    console.log("updating timestamped locator", id, timestamped)
    await writeLocator(parseInt(id), timestamped)
    locators[id] = timestamped
  }

  return locators as Record<string, TimestampedLocator>
}

export async function writeBookIds(bookIds: number[]): Promise<void> {
  return AsyncStorage.setItem("books", JSON.stringify(bookIds))
}

export async function writeBook(bookId: number): Promise<void> {
  const bookIds = await readBookIds()
  await writeBookIds([...(bookIds ?? []), bookId])
}

export async function writeLocator(
  bookId: number,
  locator: TimestampedLocator,
) {
  return AsyncStorage.setItem(
    `books.${bookId}.locator`,
    JSON.stringify(locator),
  )
}

export async function readBookmarks(bookId: number) {
  const entry = await AsyncStorage.getItem(`books.${bookId}.bookmarks`)
  if (entry === null) return []
  return JSON.parse(entry) as ReadiumLocator[]
}

export async function writeBookmark(bookId: number, bookmark: ReadiumLocator) {
  const bookmarks = await readBookmarks(bookId)
  return AsyncStorage.setItem(
    `books.${bookId}.bookmarks`,
    JSON.stringify([...bookmarks, bookmark]),
  )
}

export async function deleteBookmark(bookId: number, bookmark: ReadiumLocator) {
  const bookmarks = await readBookmarks(bookId)
  return AsyncStorage.setItem(
    `books.${bookId}.bookmarks`,
    JSON.stringify(bookmarks.filter((b) => !areLocatorsEqual(b, bookmark))),
  )
}

export async function readHighlights(bookId: number) {
  const entry = await AsyncStorage.getItem(`books.${bookId}.highlights`)
  if (entry === null) return []
  return JSON.parse(entry) as Highlight[]
}

export async function writeHighlight(bookId: number, highlight: Highlight) {
  const highlights = await readHighlights(bookId)
  return AsyncStorage.setItem(
    `books.${bookId}.highlights`,
    JSON.stringify([...highlights, highlight]),
  )
}

export async function deleteHighlight(bookId: number, highlightId: UUID) {
  const highlights = await readHighlights(bookId)
  return AsyncStorage.setItem(
    `books.${bookId}.highlights`,
    JSON.stringify(highlights.filter((h) => h.id !== highlightId)),
  )
}

export async function deleteBook(bookId: number) {
  await AsyncStorage.multiRemove([
    `books.${bookId}`,
    `books.${bookId}.locator`,
    `books.${bookId}.bookmarks`,
    `books.${bookId}.highlights`,
  ])
  const bookIds = await readBookIds()
  if (!bookIds) return

  await writeBookIds(bookIds.filter((id) => id !== bookId))
}
