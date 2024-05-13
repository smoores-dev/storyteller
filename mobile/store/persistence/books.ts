import AsyncStorage from "@react-native-async-storage/async-storage"
import { exists } from "../../exists"
import { BookDetail } from "../../apiModels"
import { ReadiumLocator } from "../../modules/readium/src/Readium.types"
import { BookshelfBook } from "../slices/bookshelfSlice"
import { EpubCFI } from "epubjs"
import { EpubCFIStep } from "epubjs/types/epubcfi"
import { getResource, locateLink } from "../../modules/readium"
import { logger } from "../../logger"

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

// Leaving this in here for now because before we roll this out
// we'll want to find a way to migrate from cfis to locators, probably?
export async function readLocations(
  ids: number[],
): Promise<Record<string, string>> {
  const entryPromises = ids.map(
    async (id) =>
      [id, await AsyncStorage.getItem(`books.${id}.location`)] as const,
  )

  const entries = await Promise.all(entryPromises)
  return Object.fromEntries(
    entries
      .filter(([, cfi]) => exists(cfi))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map(([id, cfi]) => [id, JSON.parse(cfi!) as string]),
  )
}

async function convertCfiToLocator(
  book: BookshelfBook,
  cfiString: string,
): Promise<ReadiumLocator | null> {
  const cfi = new EpubCFI(cfiString)
  const spineLink = book.manifest.readingOrder[cfi.spinePos - 1]
  if (!spineLink) return null
  logger.debug(`CFI maps to ${spineLink.href}`)

  const locator = await locateLink(book.id, spineLink)
  // @ts-expect-error Path is private
  const steps: EpubCFIStep[] = cfi.path.steps
  const stepWithSelector = steps.findLast((step) => !!step.id)
  if (!stepWithSelector) return locator

  logger.debug(`CFI contains a step with id ${stepWithSelector.id}`)

  const positionsLink = book.manifest.links.find(
    (link) => link.type === "application/vnd.readium.position-list+json",
  )
  if (!positionsLink) return locator

  const resource = await getResource(book.id, spineLink)
  const indexOfId = resource.indexOf(`id="${stepWithSelector.id}"`)
  const progression = indexOfId / resource.length

  logger.debug(`Progression seems to be ${progression}`)
  const positionsString = await getResource(book.id, positionsLink)
  const { positions } = JSON.parse(positionsString) as {
    total: number
    positions: ReadiumLocator[]
  }

  const nextPositionIndex = positions.findIndex(
    (positionLocator) =>
      positionLocator.href === spineLink.href &&
      (positionLocator.locations?.progression ?? 0) >= progression,
  )

  if (nextPositionIndex < 0) return locator
  const positionIndex =
    positions[nextPositionIndex]?.locations?.progression === progression
      ? nextPositionIndex
      : nextPositionIndex - 1

  const position = positions[positionIndex]!
  logger.debug(`Using position ${JSON.stringify(position)}`)

  const cssSelector = `#${stepWithSelector.id}`
  const locations = position.locations

  if (!locations) {
    position.locations = {
      cssSelector,
    }
  } else {
    locations.cssSelector = cssSelector
  }

  return position
}

export async function readLocators(
  books: BookshelfBook[],
): Promise<Record<string, ReadiumLocator>> {
  const cfiLocations = await readLocations(books.map(({ id }) => id))

  const entryPromises = books.map(
    async ({ id }) =>
      [id, await AsyncStorage.getItem(`books.${id}.locator`)] as const,
  )

  const entries = await Promise.all(entryPromises)
  const locators = Object.fromEntries(
    entries
      .filter(([, locator]) => exists(locator))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map(([id, locator]) => [id, JSON.parse(locator!) as ReadiumLocator]),
  )

  logger.debug("Migrating any old CFI-style locations to Readium locators")

  for (const [id, cfi] of Object.entries(cfiLocations)) {
    if (id in locators) continue

    const book = books.find((book) => book.id.toString() === id)
    if (!book) continue

    logger.debug(`Found an unmigrated CFI for ${book.title}, migrating...`)

    const locator = await convertCfiToLocator(book, cfi)
    logger.debug(
      `Converted cfi "${cfi}" to locator "${JSON.stringify(locator)}"`,
    )
    if (!locator) continue

    await AsyncStorage.setItem(`books.${id}.locator`, JSON.stringify(locator))
    await AsyncStorage.removeItem(`books.${id}.location`)

    locators[id] = locator
  }

  return locators
}

export async function writeBookIds(bookIds: number[]): Promise<void> {
  return AsyncStorage.setItem("books", JSON.stringify(bookIds))
}

export async function writeBook(bookId: number): Promise<void> {
  const bookIds = await readBookIds()
  await writeBookIds([...(bookIds ?? []), bookId])
}

export async function writeLocator(bookId: number, locator: ReadiumLocator) {
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

export async function deleteBook(bookId: number) {
  await AsyncStorage.multiRemove([
    `books.${bookId}`,
    `books.${bookId}.locator`,
    `books.${bookId}.bookmarks`,
  ])
  const bookIds = await readBookIds()
  if (!bookIds) return

  await writeBookIds(bookIds.filter((id) => id !== bookId))
}
