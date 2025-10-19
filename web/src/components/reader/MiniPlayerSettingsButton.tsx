import { Button, Collapse, Modal, Text, Title } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import {
  IconBook,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconDotsVertical,
  IconExternalLink,
  IconList,
  IconMinus,
  IconPlayerPlay,
  IconPlus,
  IconVolume,
  IconX,
} from "@tabler/icons-react"
import Link from "next/link"
import { useState } from "react"
import { Drawer } from "vaul"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  preferencesSlice,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import { readingSessionSlice } from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

import { useScreenSize } from "./hooks/useScreenSize"
import { PlaybackSpeedControl } from "./preferenceItems/PlaybackSpeedControl"
import {
  SleepTimerItem,
  useFormattedSleepTimer,
} from "./preferenceItems/SleepTimerControl"
import { TableOfContentsControl } from "./preferenceItems/TableOfContentsControl"
import { VolumeControl } from "./preferenceItems/VolumeControl"

type SettingsButtonProps = {
  book: BookWithRelations
  variant?: "icon" | "button"
  size?: "sm" | "md" | "lg"
  className?: string
}

export const MiniPlayerSettingsButton = ({
  book,
  variant = "button",
  size = "md",
  className,
}: SettingsButtonProps) => {
  const { shouldUseDrawer } = useScreenSize()
  const [opened, setOpened] = useState(false)

  const handleOpen = () => {
    setOpened(true)
  }
  const handleClose = () => {
    setOpened(false)
  }

  return (
    <>
      <Button
        variant={variant === "icon" ? "subtle" : "filled"}
        size={size}
        className={cn(
          className,
          "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover",
        )}
        onClick={handleOpen}
      >
        <IconDotsVertical size={variant === "icon" ? 18 : 16} />
        {variant === "button" && "Settings"}
      </Button>

      {shouldUseDrawer ? (
        <MiniPlayerSettingsDrawer
          opened={opened}
          onClose={handleClose}
          book={book}
        />
      ) : (
        <MiniPlayerSettingsModal
          opened={opened}
          onClose={handleClose}
          book={book}
        />
      )}
    </>
  )
}

type Props = {
  opened: boolean
  onClose: () => void
  book: BookWithRelations
}

const MiniPlayerSettingsDrawer = ({ opened, onClose, book }: Props) => {
  return (
    <Drawer.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/40" />
        <Drawer.Content className="bg-reader-surface fixed bottom-0 left-0 right-0 z-[200] flex max-h-[85vh] flex-col rounded-t-2xl p-4">
          <div className="bg-reader-surface flex-shrink-0 py-4">
            <div className="bg-reader-border mx-auto mb-4 h-1.5 w-12 rounded-full" />
            <Title order={3} className="text-reader-text">
              Settings
            </Title>
          </div>
          <MiniPlayerSettingsContent bookUUID={book.uuid} onClose={onClose} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const MiniPlayerSettingsModal = ({ opened, onClose, book }: Props) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={"Settings"}
      size="lg"
      centered
      classNames={{
        content: "bg-reader-surface border border-reader-border",
        header: "bg-reader-surface border-b border-reader-border",
        title: "text-reader-text font-heading font-bold text-2xl",
        close: "text-reader-text hover:bg-reader-surface-hover",
      }}
    >
      <div className="relative my-4 max-h-[80vh] overflow-y-scroll">
        <MiniPlayerSettingsContent bookUUID={book.uuid} onClose={onClose} />
      </div>
    </Modal>
  )
}

const BASE_HEIGHT = 48
const BASE_SPACING = 8

const getButtonTop = (index: number) => {
  return `${index * (BASE_HEIGHT + BASE_SPACING)}px`
}

const SettingsCollapsible = ({
  children,
  title,
  icon,
  index,
}: {
  children: React.ReactNode | ((isOpen: boolean) => React.ReactNode)
  title: string
  icon: React.ReactNode
  index: number
}) => {
  const [isOpen, { toggle: toggleOpen }] = useDisclosure(false)

  return (
    <>
      <div
        className={cn(
          "bg-reader-surface sticky z-10 w-full",
          index === 0 ? "h-14" : "h-14",
        )}
        style={{ top: index === 0 ? "0px" : getButtonTop(index) }}
      >
        <Button
          onClick={toggleOpen}
          variant="subtle"
          className="bg-reader-surface-hover hover:bg-reader-accent-hover/20 !mx-0 flex h-12 w-full rounded-lg"
          classNames={{
            label: "mx-0 flex w-full items-center gap-3",
            inner: "justify-between w-full",
          }}
          rightSection={
            isOpen ? (
              <IconChevronUp size={20} className="text-reader-text" />
            ) : (
              <IconChevronDown size={20} className="text-reader-text" />
            )
          }
        >
          {icon}
          <Text size="md" className="text-reader-text font-semibold">
            {title}
          </Text>
        </Button>
      </div>
      <Collapse
        in={isOpen}
        animateOpacity={false}
        transitionDuration={0}
        className="bg-reader-surface"
      >
        {typeof children === "function" ? children(isOpen) : children}
      </Collapse>
    </>
  )
}

/**
 * this only gets shown when clicking the settings button in the mini player
 */
const MiniPlayerSettingsContent = ({
  bookUUID,
  onClose,
}: Pick<Props, "onClose"> & {
  bookUUID: UUID
}) => {
  const minimizedMiniPlayer = useAppSelector((state) =>
    selectPreference(state, "minimizedMiniPlayer"),
  )
  const dispatch = useAppDispatch()

  const formattedSleepTimer = useFormattedSleepTimer()

  return (
    <>
      <div className="bg-reader-surface relative max-h-[80vh] w-full flex-1 overflow-x-clip overflow-y-scroll">
        {/* Playback Speed */}
        <SettingsCollapsible
          title="Playback Speed"
          icon={<IconPlayerPlay size={20} className="text-reader-text" />}
          index={0}
        >
          <div className="my-4">
            <PlaybackSpeedControl mode="raw" />
          </div>
        </SettingsCollapsible>

        {/* Volume */}
        <SettingsCollapsible
          title="Volume"
          icon={<IconVolume size={20} className="text-reader-text" />}
          index={1}
        >
          <div className="w-full py-4">
            <VolumeControl mode="raw" />
          </div>
        </SettingsCollapsible>

        {/* Sleep Timer */}
        <SettingsCollapsible
          title={formattedSleepTimer ? formattedSleepTimer : "Sleep Timer"}
          icon={<IconClock size={20} className="text-reader-text" />}
          index={2}
        >
          <SleepTimerItem mode="raw" />
          <div className="from-reader-surface absolute right-0 top-0 h-full w-10 bg-gradient-to-l to-transparent" />
        </SettingsCollapsible>

        {/* Table of Contents */}
        <SettingsCollapsible
          title="Table of Contents"
          icon={<IconList size={20} className="text-reader-text" />}
          index={3}
        >
          {/* this is so we can autoscroll to the current chapter on open */}
          {(isOpen) => <TableOfContentsControl mode="raw" opened={isOpen} />}
        </SettingsCollapsible>

        <div
          className="bg-reader-surface sticky z-10 h-14 w-full"
          style={{ top: getButtonTop(4) }}
        >
          <Link
            className="bg-reader-surface-hover hover:bg-reader-accent-hover/20 !mx-0 flex h-12 w-full items-center justify-between gap-3 rounded-lg px-4 hover:underline"
            href={`/books/${bookUUID}/read`}
          >
            <div className="flex items-center justify-start gap-3 pl-1">
              <IconBook width={20} className="text-reader-text" />
              <Text size="md" className="text-reader-text font-semibold">
                Read book
              </Text>
            </div>
            <IconExternalLink width={20} className="text-reader-text" />
          </Link>
        </div>

        <div
          className="bg-reader-surface sticky z-10 h-14 w-full"
          style={{ top: getButtonTop(5) }}
        >
          <Button
            variant="subtle"
            className="bg-reader-surface-hover !mx-0 flex h-12 w-full rounded-lg px-4"
            classNames={{
              label: "mx-0 flex w-full items-center justify-start gap-3",
              inner: "justify-between w-full",
            }}
            onClick={() => {
              dispatch(
                preferencesSlice.actions.updatePreference({
                  key: "minimizedMiniPlayer",
                  value: !minimizedMiniPlayer,
                  target: "global",
                }),
              )
              onClose()
            }}
          >
            {minimizedMiniPlayer ? (
              <IconPlus width={20} className="text-reader-text" />
            ) : (
              <IconMinus width={20} className="text-reader-text" />
            )}
            <Text size="md" className="text-reader-text font-semibold">
              {minimizedMiniPlayer
                ? "Keep mini player open"
                : "Minimize mini player"}
            </Text>
          </Button>
        </div>
        <CloseMiniPlayerButton onClose={onClose} />
      </div>
    </>
  )
}

const CloseMiniPlayerButton = ({ onClose }: { onClose: () => void }) => {
  const dispatch = useAppDispatch()

  const onCloseMiniPlayer = () => {
    dispatch(
      preferencesSlice.actions.updatePreference({
        key: "currentlyListeningBookId",
        value: null,
        target: "global",
      }),
    )
    dispatch(readingSessionSlice.actions.closeBook())
    onClose()
  }

  return (
    <>
      <div
        className="bg-reader-surface sticky z-10 h-14 w-full"
        style={{ top: getButtonTop(6) }}
      >
        <Button
          variant="subtle"
          className="!mx-0 flex h-12 w-full rounded-lg bg-red-200"
          classNames={{
            label: "mx-0 flex w-full items-center justify-start gap-3",
            inner: "justify-between w-full",
          }}
          onClick={() => {
            onCloseMiniPlayer()
          }}
        >
          <IconX width={20} className="text-rose-500" />
          <Text size="md" className="font-semibold text-rose-500">
            Close mini player
          </Text>
        </Button>
      </div>
    </>
  )
}
