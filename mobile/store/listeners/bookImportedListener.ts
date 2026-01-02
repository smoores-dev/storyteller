import { File, Paths } from "expo-file-system"
import { router } from "expo-router"

import { createBook } from "@/database/books"
import { type BookToCreator } from "@/database/schema"
import { getStatusByName } from "@/database/statuses"
import {
  buildAudiobookManifest,
  getPositions,
  getResource,
  openPublication,
  parseLocalizedString,
  readiumToStorytellerAuthors,
} from "@/modules/readium"
import { bookImported } from "@/store/actions"
import { localApi } from "@/store/localApi"
import {
  copyReadaloudToEbook,
  ensureCoversDirectory,
  getLocalBookCoverUrl,
  getLocalBookExtractedUrl,
  importBookFile,
} from "@/store/persistence/files"
import { randomUUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: bookImported,
  effect: async (action, listenerApi) => {
    router.replace("/")

    const { url } = action.payload
    const uuid = randomUUID()

    await importBookFile(uuid, url)

    const epubManifest = await openPublication(
      uuid,
      getLocalBookExtractedUrl(uuid, "readaloud"),
    )

    const format = epubManifest.readingOrder.some((link) =>
      link.alternate?.some((link) => link.type === "application/smil+xml"),
    )
      ? "readaloud"
      : "ebook"

    if (format === "ebook") {
      await copyReadaloudToEbook(uuid)
    }

    const audioManifest =
      format === "readaloud" ? await buildAudiobookManifest(uuid) : null

    const positions = await getPositions(uuid)

    let publicationDate: string | null = null
    try {
      if (epubManifest.metadata.published) {
        publicationDate = new Date(
          epubManifest.metadata.published,
        ).toISOString()
      }
    } catch {
      // pass
    }
    const coverLink = epubManifest.resources?.find((resource) =>
      resource.rel?.includes("cover"),
    )

    let ebookCoverUrl: string | undefined = undefined

    if (coverLink) {
      const ext = Paths.extname(coverLink.href)
      const coverImage = await getResource(uuid, coverLink)
      await ensureCoversDirectory()
      ebookCoverUrl = getLocalBookCoverUrl(uuid, ext)
      new File(ebookCoverUrl).write(coverImage, {
        encoding: "base64",
      })
    }

    // const audiobookCoverLink = epubManifest.resources?.find(
    //   (resource) =>
    //     // TODO: expose this somehow
    //     resource.properties?.["storyteller:audio-cover-image"],
    // )

    // let audiobookCoverUrl = ebookCoverUrl

    // if (audiobookCoverLink && format === "readaloud") {
    //   const ext = Paths.extname(audiobookCoverLink.href)
    //   const coverImage = await getResource(uuid, audiobookCoverLink)
    //   await ensureCoversDirectory()
    //   audiobookCoverUrl = getLocalBookCoverUrl(uuid, ext)
    //   new File(audiobookCoverUrl).write(coverImage, {
    //     encoding: "base64",
    //   })
    // }

    const readiumSeries = epubManifest.metadata.belongsTo?.series ?? []
    const seriesMd = Array.isArray(readiumSeries)
      ? readiumSeries
      : [readiumSeries]
    const series = seriesMd
      .map((s) => (typeof s === "string" ? { name: s } : s))
      .map((s, index) => ({
        ...s,
        featured: index === 0,
        uuid: randomUUID(),
        name: parseLocalizedString(s.name),
      }))

    const creators = readiumToStorytellerAuthors(
      epubManifest.metadata.author,
    ).map((a) => ({
      fileAs: a.file_as,
      role: a.role as BookToCreator["role"] | null,
      name: a.name,
      uuid: randomUUID(),
    }))

    const tagsMd = epubManifest.metadata.subject ?? []
    const tags = tagsMd
      .map((t) => (typeof t === "string" ? { name: t } : t))
      .map(({ name }) => ({
        uuid: randomUUID(),
        name: parseLocalizedString(name),
      }))

    const toRead = await getStatusByName("To read")

    await createBook(
      {
        uuid,
        title: parseLocalizedString(epubManifest.metadata.title),
        subtitle: epubManifest.metadata.subtitle
          ? parseLocalizedString(epubManifest.metadata.subtitle)
          : null,
        description: epubManifest.metadata.description
          ? parseLocalizedString(epubManifest.metadata.description)
          : null,
        language: epubManifest.metadata.language,
        publicationDate,
        ...(ebookCoverUrl && { ebookCoverUrl }),
        // ...(audiobookCoverUrl &&
        //   format === "readaloud" && { audiobookCoverUrl }),
      },
      {
        status: toRead.uuid,
        ...(format === "readaloud" && {
          readaloud: {
            uuid: randomUUID(),
            downloadStatus: "DOWNLOADED",
            downloadProgress: 100,
            status: "ALIGNED",
            epubManifest,
            audioManifest,
            positions,
          },
        }),
        ...(format === "ebook" && {
          ebook: {
            uuid: randomUUID(),
            downloadStatus: "DOWNLOADED",
            downloadProgress: 100,
            manifest: epubManifest,
            positions,
          },
        }),
        creators,
        series,
        tags,
        position: {
          uuid: randomUUID(),
          locator: positions[0]!,
          timestamp: Date.now(),
        },
      },
    )

    listenerApi.dispatch(
      localApi.util.invalidateTags(["Books", "Tags", "Creators", "Series"]),
    )

    router.push({ pathname: "/book/[uuid]", params: { uuid } })
  },
})
