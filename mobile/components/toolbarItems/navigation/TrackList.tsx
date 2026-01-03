import { skipToken } from "@reduxjs/toolkit/query"
import { File } from "expo-file-system"
import { type RefObject, useRef } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { useSafeAreaFrame } from "react-native-safe-area-context"

import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { useAudioBook } from "@/hooks/useAudioBook"
import { useSpacingVariable } from "@/hooks/useSpacingVariable"
import { cn } from "@/lib/utils"
import { type ReadiumLink } from "@/modules/readium/src/Readium.types"
import { playerTrackChanged } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import { getLocalBookExtractedUrl } from "@/store/persistence/files"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"
import { type BookshelfTrack } from "@/store/slices/bookshelfSlice"

interface Props {
  onClose?: () => void
}

export function TrackLisk({ onClose }: Props) {
  const ref = useRef<null | ScrollView>(null)
  const currentItemRef = useRef<null | View>(null)

  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const format = useAppSelector(getCurrentlyPlayingFormat) ?? "readaloud"

  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  const { track, tracks } = useAudioBook()

  const directory = bookUuid && getLocalBookExtractedUrl(bookUuid, format)

  const fromTracks = directory
    ? tracks.map((track) => ({
        href: track.relativeUrl + "#t=0",
        title: track.title,
      }))
    : []

  const currentTrack = tracks[track.index]

  const listing =
    format === "audiobook"
      ? book?.audiobook?.manifest?.toc ?? fromTracks
      : book?.readaloud?.audioManifest?.toc ?? fromTracks
  const frame = useSafeAreaFrame()

  const maxHeight = frame.height - useSpacingVariable(72)

  if (!book) return null

  return (
    <ScrollView
      ref={ref}
      style={{ maxHeight }}
      onLayout={() => {
        if (!ref.current) return
        // @ts-expect-error ScrollView is a perfectly valid component, not sure what
        // exactly the issue is here
        currentItemRef.current?.measureLayout(ref.current, (_x, y) => {
          ref.current?.scrollTo({
            y: y - 40,
            animated: false,
          })
        })
      }}
    >
      <Sublist
        listing={listing}
        currentItemRef={currentItemRef}
        currentTrack={currentTrack}
        directory={directory}
        track={track}
        tracks={tracks}
        onClose={onClose}
      />
    </ScrollView>
  )
}

function Sublist({
  listing,
  currentTrack,
  directory,
  track,
  tracks,
  currentItemRef,
  onClose,
}: {
  listing: ReadiumLink[]
  currentTrack: BookshelfTrack | undefined
  directory: string | null
  track: ReturnType<typeof useAudioBook>["track"]
  tracks: ReturnType<typeof useAudioBook>["tracks"]
  currentItemRef: RefObject<View | null>
  onClose?: (() => void) | undefined
}) {
  const dispatch = useAppDispatch()

  return (
    <>
      {listing
        .map(({ href, title, children }) => {
          const [urlPath, startPositionString] = href.split("#t=")
          const startPosition = parseInt(startPositionString ?? "0", 10)

          return {
            href,
            url: new File(directory!, urlPath!).uri,
            startPosition,
            title,
            children: children ?? [],
          }
        })
        .map(({ url, startPosition, ...current }, index, array) => {
          const encodedCurrentUrl = encodeURI(
            (currentTrack?.url as string | undefined) ?? "",
          )
          const next = array[index + 1]
          const isCurrentTrack =
            url === encodedCurrentUrl &&
            track.position >= startPosition &&
            (encodedCurrentUrl !== next?.url ||
              !next ||
              track.position < next.startPosition)

          return {
            url,
            startPosition,
            ...current,
            isCurrentTrack,
          }
        })
        .map(
          ({ href, url, startPosition, isCurrentTrack, title, children }) => (
            <View
              collapsable={false}
              key={href}
              {...(isCurrentTrack && {
                ref: currentItemRef,
              })}
              style={{ paddingHorizontal: 8 }}
            >
              <Button
                variant={isCurrentTrack ? "secondary" : "ghost"}
                className={cn(
                  "h-auto justify-start border-b border-b-gray-400 p-4 sm:h-auto",
                  {
                    "bg-secondary": 0,
                  },
                )}
                onPress={async () => {
                  if (isCurrentTrack) return

                  const track = tracks.findIndex(
                    (t) => encodeURI(t.url as string) === url,
                  )
                  if (track === -1) return
                  dispatch(
                    playerTrackChanged({
                      index: track,
                      position: startPosition,
                    }),
                  )
                  onClose?.()
                }}
              >
                <Text className="text-sm font-bold">{title}</Text>
              </Button>
              <Sublist
                listing={children}
                currentItemRef={currentItemRef}
                currentTrack={currentTrack}
                directory={directory}
                track={track}
                tracks={tracks}
                onClose={onClose}
              />
            </View>
          ),
        )}
    </>
  )
}
