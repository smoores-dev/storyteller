"use client"

import { Fragment, useState } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
  FilterableMenuSurface,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { useAppDispatch } from "@/store/appState"
import { preferencesSlice } from "@/store/slices/preferencesSlice"
import { type UUID } from "@/uuid"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import {
  OverrideMark,
  readerMenuClassName,
  readerMenuSeparatorClassName,
  usePreferenceApi,
} from "./readerSettingsRows"
import { SECTIONS } from "./readerSettingsSections"

const LABEL = "Reader settings"

function ApplyToAllBooksItem({ bookUuid }: { bookUuid: UUID }) {
  const dispatch = useAppDispatch()
  const [applied, setApplied] = useState(false)
  return (
    <FilterableMenuItem
      closeOnClick={false}
      textValue="Apply to all books"
      icon={<icon.Books />}
      title="Every book will use the settings of this book"
      onSelect={() => {
        dispatch(
          preferencesSlice.actions.applyBookPreferencesToAllBooks({
            bookId: bookUuid,
          }),
        )
        setApplied(true)
      }}
    >
      <span className="min-w-0 flex-1 truncate">Apply to all books</span>
      {applied && <icon.Check className="text-reader-accent" />}
    </FilterableMenuItem>
  )
}

function ReaderSettingsItems({ bookUuid }: { bookUuid: UUID }) {
  const api = usePreferenceApi(bookUuid)
  return (
    <>
      {SECTIONS.map((section) => (
        <FilterableMenuSub key={section.key}>
          <FilterableMenuSubTrigger
            icon={section.icon}
            textValue={section.label}
          >
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
            <OverrideMark show={section.keys.some(api.overridden)} />
          </FilterableMenuSubTrigger>
          <FilterableMenuSubContent
            searchable={false}
            className={cn(readerMenuClassName, "w-64")}
          >
            <section.Content api={api} inline={false} />
          </FilterableMenuSubContent>
        </FilterableMenuSub>
      ))}
      <FilterableMenuSeparator className={readerMenuSeparatorClassName} />
      <ApplyToAllBooksItem bookUuid={bookUuid} />
    </>
  )
}

function ReaderSettingsDrawerContent({
  bookUuid,
  onClose,
}: {
  bookUuid: UUID
  onClose?: () => void
}) {
  const api = usePreferenceApi(bookUuid)
  return (
    <FilterableMenuSurface
      searchable={false}
      className={readerMenuClassName}
      onClose={() => {
        onClose?.()
      }}
    >
      {SECTIONS.map((section) => (
        <Fragment key={section.key}>
          <section.Content api={api} inline />
          <FilterableMenuSeparator className={readerMenuSeparatorClassName} />
        </Fragment>
      ))}
      <ApplyToAllBooksItem bookUuid={bookUuid} />
    </FilterableMenuSurface>
  )
}

export const ReaderSettingsMenu = (props: ToolProps & { bookUuid: UUID }) => {
  const { isOpen, openMenu, closeMenu } = useMenuToggle()

  if (props.mode === "raw") {
    return <ReaderSettingsDrawerContent bookUuid={props.bookUuid} />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label={LABEL}
        icon={<icon.Aa size="lg" />}
        onClick={() => {
          props.openDrawer(
            { type: "reading-settings", bookUuid: props.bookUuid },
            LABEL,
          )
        }}
      />
    )
  }

  return (
    <FilterableMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (open) openMenu()
        else closeMenu()
      }}
    >
      <FilterableMenuTrigger
        render={<ToolbarIcon label={LABEL} icon={<icon.Aa size="lg" />} />}
      />
      <FilterableMenuContent
        searchable={false}
        align="end"
        className={cn(readerMenuClassName, "w-52")}
      >
        <ReaderSettingsItems bookUuid={props.bookUuid} />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

ReaderSettingsMenu.DrawerContent = ReaderSettingsDrawerContent
