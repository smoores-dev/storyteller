import { skipToken } from "@reduxjs/toolkit/query"
import { Gauge, MinusCircle, PlusCircle } from "lucide-react-native"

import { Group } from "@/components/ui/Group"
import { Stack } from "@/components/ui/Stack"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Text } from "@/components/ui/text"
import { useAppSelector } from "@/store/appState"
import {
  useGetBookPreferencesQuery,
  useUpdateBookPreferenceMutation,
} from "@/store/localApi"
import { getCurrentlyPlayingBookUuid } from "@/store/selectors/bookshelfSelectors"

export function SpeedItem() {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const { data: bookPreferences } = useGetBookPreferencesQuery(
    bookUuid
      ? {
          uuid: bookUuid,
        }
      : skipToken,
  )
  const currentSpeed = bookPreferences?.audio?.speed ?? 1

  const [updateBookPreference] = useUpdateBookPreferenceMutation()

  if (!bookUuid) return null

  return (
    <Popover>
      <PopoverTrigger className="items-center" asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-12 sm:h-9 sm:w-11"
        >
          {currentSpeed === 1 ? (
            <Icon as={Gauge} size={24} />
          ) : (
            <Text
              numberOfLines={1}
              minimumFontScale={1}
              maxFontSizeMultiplier={1}
              className="px-2 text-xs font-bold"
            >
              {currentSpeed}x
            </Text>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="rounded border border-secondary bg-background">
        <Stack className="items-center">
          <Text>Playback speed</Text>
          <Text>{currentSpeed}x</Text>
          <Group className="items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onPress={() => {
                updateBookPreference({
                  bookUuid,
                  name: "audio",
                  value: {
                    ...bookPreferences?.audio,
                    speed: Math.round(((currentSpeed ?? 1) - 0.1) * 10) / 10,
                  },
                })
              }}
            >
              <Icon as={MinusCircle} size={16} />
            </Button>
            <Slider
              className="grow"
              value={currentSpeed}
              step={0.1}
              start={0.5}
              stop={4}
              onValueChange={(newValue) => {
                updateBookPreference({
                  bookUuid,
                  name: "audio",
                  value: {
                    ...bookPreferences?.audio,
                    speed: Math.round(((newValue ?? 1) - 0.1) * 10) / 10,
                  },
                })
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onPress={() => {
                updateBookPreference({
                  bookUuid,
                  name: "audio",
                  value: {
                    ...bookPreferences?.audio,
                    speed: Math.round(((currentSpeed ?? 1) + 0.1) * 10) / 10,
                  },
                })
              }}
            >
              <Icon as={PlusCircle} size={16} />
            </Button>
          </Group>
          <Group className="m-2 flex-wrap gap-2">
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
              <Button
                className="h-8 w-8 rounded-full p-0"
                variant="secondary"
                key={speed}
                onPress={() => {
                  updateBookPreference({
                    bookUuid,
                    name: "audio",
                    value: {
                      ...bookPreferences?.audio,
                      speed,
                    },
                  })
                }}
              >
                <Text maxFontSizeMultiplier={1.5} className="text-[10px]">
                  {speed}
                </Text>
              </Button>
            ))}
          </Group>
        </Stack>
      </PopoverContent>
    </Popover>
  )
}
