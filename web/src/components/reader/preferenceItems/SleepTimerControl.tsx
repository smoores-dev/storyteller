import { Button, Menu, Text } from "@mantine/core"
import { IconClock } from "@tabler/icons-react"
import {
  addMinutes,
  addSeconds,
  intervalToDuration,
  isFuture,
  isPast,
} from "date-fns"
import { useCallback, useEffect, useState } from "react"

import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  readingSessionSlice,
  selectSleepTimer,
} from "@/store/slices/readingSessionSlice"

import { useRegisterNavigatorClickhandler } from "../hooks/useNavigatorEvents"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { popoverClassNames } from "./shared"

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

  return (
    <div className="flex w-full flex-col overflow-y-auto overflow-x-clip">
      <SleepTimerButton minutes={0} text="Off" />
      {[5, 10, 15, 30, 45, 60, 90, 120].map((minutes) => (
        <SleepTimerButton
          key={minutes}
          minutes={minutes}
          text={`${minutes} min`}
        />
      ))}
      {process.env.NODE_ENV === "development" && (
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

  const [open, setOpen] = useState(false)
  const closeOnClickNavigator = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  useRegisterNavigatorClickhandler(closeOnClickNavigator)

  if (props.mode === "raw") {
    return <SleepTimerControl />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Sleep timer"
        icon={
          formattedSleepTimer ? (
            <Text className="text-xs">{formattedSleepTimer}</Text>
          ) : (
            <IconClock size={18} />
          )
        }
        onClick={() => {
          props.openDrawer({ type: "sleep-timer" }, "Sleep timer")
        }}
      />
    )
  }

  return (
    <Menu
      opened={open}
      onDismiss={() => {
        setOpen(false)
      }}
      classNames={popoverClassNames}
      withArrow
      withinPortal={false}
    >
      <Menu.Target>
        <ToolbarIcon
          label="Sleep timer"
          icon={
            formattedSleepTimer ? (
              <Text className="text-xs">{formattedSleepTimer}</Text>
            ) : (
              <IconClock size={18} />
            )
          }
          onClick={() => {
            setOpen((prev) => !prev)
          }}
        />
      </Menu.Target>
      <Menu.Dropdown className="flex flex-col">
        <SleepTimerControl />
      </Menu.Dropdown>
    </Menu>
  )
}

SleepTimerItem.DrawerContent = SleepTimerControl

const SleepTimerButton = ({
  minutes,
  text,
  onClick,
}: {
  minutes: number
  text?: string
  onClick?: () => void
}) => {
  const dispatch = useAppDispatch()

  return (
    <Button
      variant="subtle"
      className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover"
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
      <Text className="text-sm">{text ?? `${minutes} min`}</Text>
    </Button>
  )
}
