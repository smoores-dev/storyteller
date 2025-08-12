import { isAudioFile } from "@/audio"
import {
  BookUpdate,
  createBook,
  createBookFromEpub,
  CreatorRelation,
  getBooks,
  updateBook,
} from "@/database/books"
import { logger } from "@/logging"
import { UUID } from "@/uuid"
import { Audiobook } from "@smoores/audiobook/node"
import { Epub } from "@smoores/epub/node"
import { readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { writeCachedCoverImage } from "../fs"
import { getAudioCover, getEpubCover } from "../covers"
import { optimizeImage } from "@/images"
import { getMetadataFromEpub } from "@/process/processEpub"

export async function scan(importPath: string, collectionUuid: UUID | null) {
  const allBooks = await getBooks()
  const books = collectionUuid
    ? allBooks.filter((book) =>
        book.collections.some((c) => c.uuid === collectionUuid),
      )
    : allBooks

  const entries = await readdir(importPath, {
    recursive: true,
    withFileTypes: true,
  })

  const ebookPaths: string[] = []
  const audiobookPathsSet = new Set<string>()
  const bookPaths: {
    ebook?: string
    audiobook?: string
    readaloud?: string
  }[] = []

  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const ext = extname(entry.name)
    if (ext === ".epub") {
      ebookPaths.push(join(entry.parentPath, entry.name))
    }
    if (isAudioFile(ext)) {
      audiobookPathsSet.add(entry.parentPath)
    }
  }

  const audiobookPaths = Array.from(audiobookPathsSet)

  const handledEbookPaths = new Set<string>()
  const handledAudiobookPaths = new Set<string>()

  for (const ebookPath of ebookPaths) {
    if (handledEbookPaths.has(ebookPath)) continue

    const dir = dirname(ebookPath)
    const additionalEbookPaths = ebookPaths.filter(
      (path) => path.startsWith(dir) && path !== ebookPath,
    )
    let plainEbookPath: string | null = null
    let readaloudPath: string | null = null

    // TODO: log ebook files that don't get handled?
    for (const path of [ebookPath, ...additionalEbookPaths]) {
      if (plainEbookPath && readaloudPath) break
      try {
        const epub = await Epub.from(path)
        const manifest = await epub.getManifest()
        const isReadaloud = Object.values(manifest).some(
          (item) => item.mediaOverlay,
        )
        if (isReadaloud && !readaloudPath) {
          readaloudPath = path
          handledEbookPaths.add(path)
        }
        if (!isReadaloud && !plainEbookPath) {
          plainEbookPath = path
          handledEbookPaths.add(path)
        }
      } catch (e) {
        logger.error(
          `Encountered issue attempting to read EPUB file at ${path}, skipping`,
        )
        logger.error(e)
        continue
      }
    }

    const nestedAudiobookPaths = audiobookPaths.filter((path) =>
      path.startsWith(dir),
    )

    // TODO: log audiobook files that don't get handled?
    const [nestedAudiobookPath] = nestedAudiobookPaths
    if (nestedAudiobookPath) {
      handledAudiobookPaths.add(nestedAudiobookPath)
    }
    if (plainEbookPath || readaloudPath || nestedAudiobookPath) {
      bookPaths.push({
        ...(plainEbookPath && { ebook: plainEbookPath }),
        ...(readaloudPath && { readaloud: readaloudPath }),
        ...(nestedAudiobookPath && { audiobook: nestedAudiobookPath }),
      })
    }
  }

  for (const audiobookPath of audiobookPaths) {
    if (handledAudiobookPaths.has(audiobookPath)) continue

    bookPaths.push({ audiobook: audiobookPath })
  }

  for (const bookPath of bookPaths) {
    const book = books.find(
      (book) =>
        (bookPath.ebook && bookPath.ebook === book.ebook?.filepath) ||
        (bookPath.audiobook &&
          bookPath.audiobook === book.audiobook?.filepath) ||
        (bookPath.readaloud && bookPath.readaloud === book.readaloud?.filepath),
    )

    if (!book) {
      logger.info(
        `Found a new book! Importing from ${JSON.stringify(bookPath)}`,
      )

      if (bookPath.readaloud || bookPath.ebook) {
        // We've already confirmed that one of these is truthy above
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const epub = await Epub.from((bookPath.readaloud ?? bookPath.ebook)!)

        const created = await createBookFromEpub(
          epub,
          {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            title: basename((bookPath.readaloud ?? bookPath.ebook)!, ".epub"),
          },
          {
            ...(collectionUuid && { collections: [collectionUuid] }),
            ...(bookPath.ebook && { ebook: { filepath: bookPath.ebook } }),
            ...(bookPath.readaloud && {
              readaloud: {
                filepath: bookPath.readaloud,
                status: "ALIGNED",
              },
            }),
            ...(bookPath.audiobook && {
              audiobook: { filepath: bookPath.audiobook },
            }),
          },
        )

        const coverImage = await getEpubCover(created)
        if (coverImage) {
          const optimized = await optimizeImage({
            buffer: coverImage.data,
            height: 225,
            width: 147,
            contentType: coverImage.mimeType,
          })

          coverImage.data = optimized
          await writeCachedCoverImage(
            created.uuid,
            "text",
            225,
            147,
            coverImage,
          )
        }
      } else if (bookPath.audiobook) {
        const audiobookPath = bookPath.audiobook
        const entries = await readdir(audiobookPath)
        const audiobook = await Audiobook.from(
          entries
            .filter((entry) => isAudioFile(entry))
            .map((relativePath) => join(audiobookPath, relativePath)),
        )

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const title = await audiobook.getTitle()
        const description = await audiobook.getDescription()
        const authors = await audiobook.getAuthors()
        const narrators = await audiobook.getNarrators()
        audiobook.close()

        const creators: CreatorRelation[] = []
        creators.push(
          ...authors.map((name) => ({ name, fileAs: name, role: "aut" })),
        )
        creators.push(
          ...narrators.map((name) => ({ name, fileAs: name, role: "nrt" })),
        )

        const created = await createBook(
          {
            title: title ?? basename(audiobookPath),
            description,
          },
          {
            ...(collectionUuid && { collections: [collectionUuid] }),
            audiobook: { filepath: audiobookPath },
            ...(creators.length && {
              creators,
            }),
          },
        )

        const coverImage = await getAudioCover(created)
        if (coverImage) {
          const optimized = await optimizeImage({
            buffer: coverImage.data,
            height: 147,
            width: 147,
            contentType: coverImage.mimeType,
          })

          coverImage.data = optimized
          await writeCachedCoverImage(
            created.uuid,
            "audio",
            147,
            147,
            coverImage,
          )
        }
      }
      continue
    }

    if (
      bookPath.ebook === book.ebook?.filepath &&
      bookPath.readaloud === book.readaloud?.filepath &&
      bookPath.audiobook === book.audiobook?.filepath
    ) {
      // Book has already been imported and hasn't changed
      continue
    }

    let update: BookUpdate | null = null
    const relations: Parameters<typeof updateBook>[2] = {}

    if (bookPath.ebook && !book.ebook) {
      logger.info(
        `Found new ebook file for ${book.title} at ${bookPath.ebook}. Importing metadata.`,
      )
      const epub = await Epub.from(bookPath.ebook)
      const {
        update: ebookUpdate,
        relations: { tags, series },
      } = await getMetadataFromEpub(epub)

      update = ebookUpdate

      Object.assign(relations, {
        tags,
        series,
        ebook: {
          filepath: bookPath.ebook,
          missing: false,
        },
      })
    }

    if (book.ebook?.filepath) {
      try {
        await stat(book.ebook.filepath)
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
          logger.info(
            `Ebook file for ${book.title} is missing, was ${book.ebook.filepath}`,
          )
          relations.ebook = {
            filepath: book.ebook.filepath,
            missing: true,
          }
        }
      }
    }

    if (bookPath.audiobook && !book.audiobook) {
      logger.info(
        `Found new audiobook file(s) for ${book.title} at ${bookPath.audiobook}. Importing.`,
      )

      if (!book.narrators.length) {
        const audiobookPath = bookPath.audiobook
        const entries = await readdir(audiobookPath)
        const audiobook = await Audiobook.from(
          entries
            .filter((entry) => isAudioFile(entry))
            .map((relativePath) => join(audiobookPath, relativePath)),
        )
        relations.creators ??= book.creators
        relations.creators.push(
          ...(await audiobook.getNarrators()).map((name) => ({
            name,
            fileAs: name,
            role: "nrt",
          })),
        )
        audiobook.close()
      }

      relations.audiobook = {
        filepath: bookPath.audiobook,
        missing: false,
      }
    }
    if (book.audiobook?.filepath) {
      try {
        await stat(book.audiobook.filepath)
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
          logger.info(
            `Audiobook file for ${book.title} is missing, was ${book.audiobook.filepath}`,
          )
          relations.audiobook = {
            filepath: book.audiobook.filepath,
            missing: true,
          }
        }
      }
    }

    if (bookPath.readaloud && !book.readaloud) {
      logger.info(
        `Found new readaloud book file for ${book.title} at ${bookPath.readaloud}. Importing metadata.`,
      )
      const epub = await Epub.from(bookPath.readaloud)
      const {
        update: readaloudUpdate,
        relations: { tags, series },
      } = await getMetadataFromEpub(epub)

      if (!update) {
        update = readaloudUpdate
      } else {
        Object.assign(update, readaloudUpdate)
      }

      Object.assign(relations, {
        tags,
        series,
        readaloud: {
          filepath: bookPath.readaloud,
          missing: false,
          status: "ALIGNED",
        },
      })
    }

    if (book.readaloud?.filepath) {
      try {
        await stat(book.readaloud.filepath)
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
          logger.info(
            `Readaloud book file for ${book.title} is missing, was ${book.readaloud.filepath}`,
          )
          relations.readaloud = {
            filepath: book.readaloud.filepath,
            missing: true,
          }
        }
      }
    }

    const epubCover = await getEpubCover(book)
    if (epubCover) {
      const optimized = await optimizeImage({
        buffer: epubCover.data,
        height: 225,
        width: 147,
        contentType: epubCover.mimeType,
      })

      epubCover.data = optimized
      await writeCachedCoverImage(book.uuid, "text", 225, 147, epubCover)
    }

    const audioCover = await getAudioCover(book)
    if (audioCover) {
      const optimized = await optimizeImage({
        buffer: audioCover.data,
        height: 147,
        width: 147,
        contentType: audioCover.mimeType,
      })

      audioCover.data = optimized
      await writeCachedCoverImage(book.uuid, "audio", 147, 147, audioCover)
    }

    await updateBook(book.uuid, update, relations)
  }

  logger.info("Scanning complete")
}
