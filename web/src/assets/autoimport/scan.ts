import { readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import { Audiobook } from "@storyteller-platform/audiobook/node"
import { Epub } from "@storyteller-platform/epub/node"

import {
  getAudioCover,
  getEpubCover,
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { writeCachedCoverImage } from "@/assets/fs"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
  keepMissingMetadata,
  keepMissingRelations,
} from "@/assets/metadata"
import { isAudioFile } from "@/audio"
import {
  type BookUpdate,
  createBookFromAudiobook,
  createBookFromEpub,
  getBooks,
  updateBook,
} from "@/database/books"
import { optimizeImage } from "@/images"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export async function scan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
) {
  const allBooks = await getBooks()
  if (signal.aborted) return

  const books = collectionUuid
    ? allBooks.filter((book) =>
        book.collections.some((c) => c.uuid === collectionUuid),
      )
    : allBooks

  const entries = await readdir(importPath, {
    recursive: true,
    withFileTypes: true,
  })
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (signal.aborted) return

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

    const dir = `${dirname(ebookPath)}/`
    const additionalEbookPaths = ebookPaths.filter(
      (path) => path.startsWith(dir) && path !== ebookPath,
    )
    let plainEbookPath: string | null = null
    let readaloudPath: string | null = null

    // TODO: log ebook files that don't get handled?
    for (const path of [ebookPath, ...additionalEbookPaths]) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) return

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
      `${path}/`.startsWith(dir),
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) return

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
                currentStage: "SPLIT_TRACKS",
              },
            }),
            ...(bookPath.audiobook && {
              audiobook: { filepath: bookPath.audiobook },
            }),
          },
        )

        const coverImage = await getEpubCover(created)
        if (coverImage) {
          await writeExtractedEbookCover(
            created,
            coverImage.filename,
            coverImage.data,
          )
          const optimized = await optimizeImage({
            buffer: coverImage.data,
            height: 225,
            width: 147,
            contentType: coverImage.mimeType,
          })

          await writeCachedCoverImage(created.uuid, "text", 225, 147, {
            ...coverImage,
            data: optimized,
          })
        }

        if (bookPath.audiobook) {
          const audiobookPath = bookPath.audiobook
          const entries = await readdir(audiobookPath)
          const audiobook = await Audiobook.from(
            entries
              .filter((entry) => isAudioFile(entry))
              .map((relativePath) => join(audiobookPath, relativePath)),
          )

          const { update: audiobookUpdate, relations: audiobookRelations } =
            await getMetadataFromAudiobook(audiobook)

          audiobook.close()

          const update = keepMissingMetadata(created, audiobookUpdate)
          const relations = keepMissingRelations(created, audiobookRelations)

          await updateBook(created.uuid, update, relations)

          const audioCover = await getAudioCover(created)

          if (audioCover) {
            await writeExtractedAudiobookCover(
              created,
              audioCover.filename,
              audioCover.data,
            )

            const optimized = await optimizeImage({
              buffer: Buffer.from(audioCover.data),
              height: 147,
              width: 147,
              contentType: audioCover.mimeType,
            })

            await writeCachedCoverImage(created.uuid, "audio", 147, 147, {
              ...audioCover,
              data: optimized,
            })
          }
        }
      } else if (bookPath.audiobook) {
        const audiobookPath = bookPath.audiobook
        const entries = await readdir(audiobookPath)
        const audiobook = await Audiobook.from(
          entries
            .filter((entry) => isAudioFile(entry))
            .map((relativePath) => join(audiobookPath, relativePath)),
        )

        const created = await createBookFromAudiobook(
          audiobook,
          {
            title: basename(audiobookPath),
          },
          {
            ...(collectionUuid && { collections: [collectionUuid] }),
            audiobook: { filepath: audiobookPath },
          },
        )
        audiobook.close()

        const coverImage = await getAudioCover(created)
        if (coverImage) {
          await writeExtractedAudiobookCover(
            created,
            coverImage.filename,
            coverImage.data,
          )
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
      const { update: ebookUpdate, relations: ebookRelations } =
        await getMetadataFromEpub(epub)

      update = keepMissingMetadata(book, ebookUpdate)

      Object.assign(relations, {
        ...keepMissingRelations(book, ebookRelations),
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

      const audiobookPath = bookPath.audiobook
      const entries = await readdir(audiobookPath)
      const audiobook = await Audiobook.from(
        entries
          .filter((entry) => isAudioFile(entry))
          .map((relativePath) => join(audiobookPath, relativePath)),
      )
      const { update: audiobookUpdate, relations: audiobookRelations } =
        await getMetadataFromAudiobook(audiobook)
      audiobook.close()

      if (!update) {
        update = keepMissingMetadata(book, audiobookUpdate)
      } else {
        Object.assign(update, keepMissingMetadata(book, audiobookUpdate))
      }

      Object.assign(relations, {
        ...keepMissingRelations(book, audiobookRelations),
        audiobook: {
          filepath: bookPath.audiobook,
        },
      })
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
      const { update: readaloudUpdate, relations: readaloudRelations } =
        await getMetadataFromEpub(epub)

      if (!update) {
        update = keepMissingMetadata(book, readaloudUpdate)
      } else {
        Object.assign(update, keepMissingMetadata(book, readaloudUpdate))
      }

      Object.assign(relations, {
        ...keepMissingRelations(book, readaloudRelations),
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
            currentStage: book.readaloud.currentStage,
          }
        }
      }
    }

    const epubCover = await getEpubCover(book)
    if (epubCover) {
      await writeExtractedEbookCover(book, epubCover.filename, epubCover.data)
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
      await writeExtractedAudiobookCover(
        book,
        audioCover.filename,
        audioCover.data,
      )
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
