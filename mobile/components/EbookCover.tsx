import { skipToken } from "@reduxjs/toolkit/query"
import { Image, type ImageStyle } from "expo-image"
import { type StyleProp } from "react-native"

import { type BookWithRelations } from "@/database/books"
import {
  useGetServerAccessTokenQuery,
  useGetServerQuery,
} from "@/store/localApi"
import { getCoverUrl } from "@/store/serverApi"

interface Props {
  book: BookWithRelations
  style?: StyleProp<ImageStyle>
}

export function EbookCover({ book, style }: Props) {
  const { data: server } = useGetServerQuery(
    book?.serverUuid ? { uuid: book.serverUuid } : skipToken,
  )
  const { data: accessToken } = useGetServerAccessTokenQuery(
    book?.serverUuid
      ? {
          serverUuid: book.serverUuid,
        }
      : skipToken,
  )

  const ebookCoverUrl =
    book?.ebookCoverUrl ??
    (server && book
      ? getCoverUrl(server.baseUrl, book.uuid, {
          height: 352,
          width: 232,
        })
      : null)

  if (!ebookCoverUrl) return null

  return (
    <Image
      style={[
        {
          flex: 1,
          height: "100%",
          width: "100%",
        },
        style,
      ]}
      alt=""
      aria-hidden
      source={{
        uri: ebookCoverUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }}
    />
  )
}
