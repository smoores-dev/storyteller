import {
  getAudioCover,
  getEpubCover,
  writeExtractedCover,
} from "@/assets/covers"
import { writeCachedCoverImage } from "@/assets/fs"
import { type BookWithRelations } from "@/database/books"
import { optimizeImage } from "@/images"

export async function cacheTextCover(book: BookWithRelations) {
  const coverImage = await getEpubCover(book)
  if (!coverImage) {
    return
  }

  await writeExtractedCover(book, "ebook", coverImage.filename, coverImage.data)
  const optimized = await optimizeImage({
    buffer: coverImage.data,
    height: 225,
    width: 147,
    contentType: coverImage.mimeType,
  })

  await writeCachedCoverImage(book.uuid, "text", 225, 147, {
    ...coverImage,
    data: optimized,
  })
}

export async function cacheAudioCover(book: BookWithRelations) {
  const audioCover = await getAudioCover(book)
  console.log("cacheAudioCover", audioCover)
  if (!audioCover) {
    console.log("no audio cover for book", book.title)
    return
  }

  await writeExtractedCover(
    book,
    "audiobook",
    audioCover.filename,
    audioCover.data,
  )
  console.log("wrote audio cover", audioCover.filename)
  console.log("writing optimized audio cover")
  const optimized = await optimizeImage({
    buffer: Buffer.from(audioCover.data),
    height: 147,
    width: 147,
    contentType: audioCover.mimeType,
  })

  console.log("writing optimized audio cover to cache")
  await writeCachedCoverImage(book.uuid, "audio", 147, 147, {
    ...audioCover,
    data: optimized,
  })
}
