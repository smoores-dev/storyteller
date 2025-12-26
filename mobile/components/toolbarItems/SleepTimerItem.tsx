import {
  addMinutes,
  addSeconds,
  intervalToDuration,
  isFuture,
  isPast,
} from "date-fns"
import { ClockFading } from "lucide-react-native"
import { useEffect, useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getSleepTimer } from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

function formatSleepTimer(sleepTimer: Date) {
  const duration = intervalToDuration({
    start: new Date(),
    end: sleepTimer,
  })
  const minutes = String(
    (duration.minutes ?? 0) + (duration.hours ? duration.hours * 60 : 0),
  ).padStart(2, "0")
  const seconds = String(duration.seconds ?? 0).padStart(2, "0")
  return `${minutes}:${seconds}`
}

const MAX_FONT_SCALE = 1.75

export function SleepTimerItem() {
  const insets = useSafeAreaInsets()

  const dispatch = useAppDispatch()
  const sleepTimer = useAppSelector(getSleepTimer)

  const [formattedSleepTimer, setFormattedSleepTimer] = useState<string | null>(
    sleepTimer && isFuture(sleepTimer) ? formatSleepTimer(sleepTimer) : null,
  )

  useEffect(() => {
    if (sleepTimer) {
      const intervalId = setInterval(() => {
        if (isPast(sleepTimer)) {
          clearInterval(intervalId)
          setFormattedSleepTimer(null)
          return
        }
        setFormattedSleepTimer(formatSleepTimer(sleepTimer))
      }, 500)
      return () => clearInterval(intervalId)
    } else {
      setFormattedSleepTimer(null)
    }
    return () => {}
  }, [sleepTimer])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="items-center" asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-12 sm:h-9 sm:w-11"
        >
          {formattedSleepTimer ? (
            <Text minimumFontScale={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {formattedSleepTimer}
            </Text>
          ) : (
            <Icon as={ClockFading} size={24} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent insets={insets}>
        <DropdownMenuItem
          onPress={() => {
            dispatch(bookshelfSlice.actions.sleepTimerSet({ sleepTimer: null }))
          }}
        >
          <Text>Off</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 5),
              }),
            )
          }}
        >
          <Text>5 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 10),
              }),
            )
          }}
        >
          <Text>10 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 15),
              }),
            )
          }}
        >
          <Text>15 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 30),
              }),
            )
          }}
        >
          <Text>30 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 45),
              }),
            )
          }}
        >
          <Text>45 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 60),
              }),
            )
          }}
        >
          <Text>60 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 90),
              }),
            )
          }}
        >
          <Text>90 min</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={() => {
            dispatch(
              bookshelfSlice.actions.sleepTimerSet({
                sleepTimer: addMinutes(new Date(), 120),
              }),
            )
          }}
        >
          <Text>120 min</Text>
        </DropdownMenuItem>
        {__DEV__ && (
          <DropdownMenuItem
            onPress={() => {
              dispatch(
                bookshelfSlice.actions.sleepTimerSet({
                  sleepTimer: addSeconds(new Date(), 5),
                }),
              )
            }}
          >
            <Text>5 sec</Text>
          </DropdownMenuItem>
        )}
        {__DEV__ && (
          <DropdownMenuItem
            onPress={() => {
              dispatch(
                bookshelfSlice.actions.sleepTimerSet({
                  sleepTimer: addSeconds(new Date(), 30),
                }),
              )
            }}
          >
            <Text>30 sec</Text>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
