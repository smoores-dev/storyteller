import { documentDirectory, getContentUriAsync } from "expo-file-system/legacy"
import { Image } from "expo-image"
import { Platform } from "react-native"

import { type BookWithRelations } from "@/database/books"
import { getServer } from "@/database/servers"
import { type StorytellerTrack } from "@/modules/readium/src/Readium.types"
import { getLocalBookFileUrl } from "@/store/persistence/files"
import { getCoverUrl } from "@/store/serverApi"

export async function generateTracks(
  book: BookWithRelations,
  format: "audiobook" | "readaloud",
): Promise<StorytellerTrack[]> {
  const server = book.serverUuid && (await getServer(book.serverUuid))
  const serverCoverUrl = server && getCoverUrl(server.baseUrl, book, "audio")

  let coverUri = book.audiobookCoverUrl
    ? new URL(book.audiobookCoverUrl, documentDirectory!).toString()
    : serverCoverUrl
      ? await Image.getCachePathAsync(serverCoverUrl)
      : null

  // Convert to content:// URI on Android for Android Auto compatibility
  if (coverUri && Platform.OS === "android") {
    try {
      coverUri = await getContentUriAsync(
        new URL(coverUri, "file://").toString(),
      )
    } catch {
      // pass
    }
  } else if (coverUri) {
    coverUri = new URL(coverUri, "file://").toString()
  }

  const manifest =
    format === "audiobook"
      ? book.audiobook?.manifest
      : book.readaloud?.audioManifest

  const audioLinks = manifest?.readingOrder ?? []

  return audioLinks.map((audioLink) => {
    const uri = getLocalBookFileUrl(book.uuid, format, audioLink.href)

    return {
      bookUuid: book.uuid,
      title: audioLink.title ?? book.title,
      bookTitle: book.title,
      uri,
      duration: audioLink.duration!,
      author: book.authors.length
        ? book.authors.map((author) => author.name).join(", ")
        : null,
      narrator: book.narrators.length
        ? book.narrators.map((narrator) => narrator.name).join(", ")
        : null,
      coverUri,
      relativeUri: audioLink.href,
      mimeType: audioLink.type.replace(/; codecs=.*/, ""),
    }
  })
}
