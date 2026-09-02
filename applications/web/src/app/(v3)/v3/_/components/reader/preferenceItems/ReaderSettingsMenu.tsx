"use client"

import { Fragment, useState } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
  FilterableMenuSeparator,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
  FilterableMenuSurface,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import {
  OverrideMark,
  type SettingsScope,
  readerMenuClassName,
  readerMenuLabelClassName,
  readerMenuSeparatorClassName,
  usePreferenceApi,
} from "./readerSettingsRows"
import { SECTIONS } from "./readerSettingsSections"

const LABEL = "Reader settings"

function ScopeItems({
  scope,
  onChange,
}: {
  scope: SettingsScope
  onChange: (scope: SettingsScope) => void
}) {
  return (
    <FilterableMenuGroup>
      <FilterableMenuLabel className={readerMenuLabelClassName}>
        Apply to
      </FilterableMenuLabel>
      <FilterableMenuItem
        closeOnClick={false}
        textValue="This book"
        icon={<icon.Book />}
        onSelect={() => {
          onChange("book")
        }}
      >
        <span className="min-w-0 flex-1 truncate">This book</span>
        {scope === "book" && <icon.Check className="text-reader-accent" />}
      </FilterableMenuItem>
      <FilterableMenuItem
        closeOnClick={false}
        textValue="All books"
        icon={<icon.Books />}
        onSelect={() => {
          onChange("global")
        }}
      >
        <span className="min-w-0 flex-1 truncate">All books</span>
        {scope === "global" && <icon.Check className="text-reader-accent" />}
      </FilterableMenuItem>
    </FilterableMenuGroup>
  )
}

function ReaderSettingsItems({ bookUuid }: { bookUuid: UUID }) {
  const [scope, setScope] = useState<SettingsScope>("book")
  const api = usePreferenceApi(bookUuid, scope)
  return (
    <>
      <ScopeItems scope={scope} onChange={setScope} />
      <FilterableMenuSeparator className={readerMenuSeparatorClassName} />
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
  const [scope, setScope] = useState<SettingsScope>("book")
  const api = usePreferenceApi(bookUuid, scope)
  return (
    <FilterableMenuSurface
      searchable={false}
      className={readerMenuClassName}
      onClose={() => {
        onClose?.()
      }}
    >
      <ScopeItems scope={scope} onChange={setScope} />
      {SECTIONS.map((section) => (
        <Fragment key={section.key}>
          <FilterableMenuSeparator className={readerMenuSeparatorClassName} />
          <section.Content api={api} inline />
        </Fragment>
      ))}
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
