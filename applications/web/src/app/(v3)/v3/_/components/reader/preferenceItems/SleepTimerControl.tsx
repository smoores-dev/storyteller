import {
  addMinutes,
  addSeconds,
  differenceInSeconds,
  intervalToDuration,
  isFuture,
  isPast,
} from "date-fns"
import { useEffect, useState } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { cn } from "@v3/_/lib/utils"

import { env } from "@/env"
import * as icon from "@/icons"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  readingSessionSlice,
  selectSleepTimer,
} from "@/store/slices/readingSessionSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"

const PRESET_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120]

export function formatSleepTimer(sleepTimer: number) {
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

export function useFormattedSleepTimer() {
  const sleepTimer = useAppSelector(selectSleepTimer)

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
      return () => {
        clearInterval(intervalId)
      }
    } else {
      setFormattedSleepTimer(null)
    }
    return () => {}
  }, [sleepTimer])

  return formattedSleepTimer
}

const SleepTimerControl = () => {
  const dispatch = useAppDispatch()
  const sleepTimer = useAppSelector(selectSleepTimer)
  const formattedSleepTimer = useFormattedSleepTimer()

  const remainingMinutes =
    formattedSleepTimer && sleepTimer
      ? Math.ceil(differenceInSeconds(sleepTimer, new Date()) / 60)
      : 0
  const activeMinutes =
    remainingMinutes > 0
      ? PRESET_MINUTES.find((minutes) => minutes >= remainingMinutes) ?? null
      : 0

  return (
    <div className="flex w-full flex-col overflow-x-clip overflow-y-auto">
      <SleepTimerButton minutes={0} text="Off" active={activeMinutes === 0} />
      {PRESET_MINUTES.map((minutes) => (
        <SleepTimerButton
          key={minutes}
          minutes={minutes}
          text={`${minutes} min`}
          active={activeMinutes === minutes}
        />
      ))}
      {env.NODE_ENV === "development" && (
        <>
          <SleepTimerButton
            minutes={5}
            text="5 sec"
            onClick={() => {
              dispatch(
                readingSessionSlice.actions.sleepTimerSet({
                  sleepTimer: addSeconds(new Date(), 5),
                }),
              )
            }}
          />
          <SleepTimerButton
            minutes={30}
            text="30 sec"
            onClick={() => {
              dispatch(
                readingSessionSlice.actions.sleepTimerSet({
                  sleepTimer: addSeconds(new Date(), 30),
                }),
              )
            }}
          />
        </>
      )}
    </div>
  )
}

export function SleepTimerItem(props: ToolProps) {
  const formattedSleepTimer = useFormattedSleepTimer()

  const { isOpen, setOpen, toggleMenu } = useMenuToggle()

  const triggerIcon = formattedSleepTimer ? (
    <span className="text-xs tabular-nums">{formattedSleepTimer}</span>
  ) : (
    <icon.Clock size="lg" />
  )

  if (props.mode === "raw") {
    return <SleepTimerControl />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Sleep timer"
        icon={triggerIcon}
        onClick={() => {
          props.openDrawer({ type: "sleep-timer" }, "Sleep timer")
        }}
      />
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <ToolbarIcon
            label="Sleep timer"
            icon={triggerIcon}
            onClick={toggleMenu}
          />
        }
      />
      <DropdownMenuContent className="bg-reader-surface text-reader-text border-reader-border min-w-36">
        <SleepTimerControl />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

SleepTimerItem.DrawerContent = SleepTimerControl

const SleepTimerButton = ({
  minutes,
  text,
  active = false,
  onClick,
}: {
  minutes: number
  text?: string
  active?: boolean
  onClick?: () => void
}) => {
  const dispatch = useAppDispatch()

  return (
    <Button
      variant="ghost"
      aria-pressed={active}
      className={cn(
        "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover w-full justify-start gap-2 rounded-sm",
        active && "text-reader-accent",
      )}
      onClick={() => {
        if (onClick) {
          onClick()
          return
        }
        dispatch(
          readingSessionSlice.actions.sleepTimerSet({
            sleepTimer: addMinutes(new Date(), minutes),
          }),
        )
      }}
    >
      <span className="text-sm">{text ?? `${minutes} min`}</span>
      {active && (
        <icon.Check size="sm" className="text-reader-accent ml-auto" />
      )}
    </Button>
  )
}
