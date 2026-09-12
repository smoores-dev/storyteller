"use client"

import { Popover } from "@base-ui/react/popover"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

import { Skeleton } from "@v3/_/components/ui/skeleton"
import { useCommon } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { ChevronRight } from "@/icons"

const ROW_HEIGHT = 32

const listClassName =
  "scroll-py-1 max-h-64 scroll-y overscroll-contain px-1 pb-1"

function LoadingRows() {
  return (
    <div className="space-y-1 p-1">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={`loading-${idx}`}
          className="flex items-center gap-2 px-2 py-1.5"
        >
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

// lets not be too cutesy, looks nicer if just instant
const menuPopupClassName =
  // "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2
  "ring-foreground/10 bg-popover text-popover-foreground z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md p-1 shadow-md ring-1 duration-100 outline-none"

const menuItemClassName =
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:text-destructive relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

const menuSubTriggerClassName =
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

const menuLabelClassName = "text-muted-foreground px-2 py-1.5 text-xs"

const searchBoxClassName =
  "placeholder:text-muted-foreground h-7 w-full bg-transparent px-2 text-sm outline-none md:h-6 md:text-xs"

function itemMatches(query: string, text: string): boolean {
  const q = query.trim().toLowerCase()
  return q === "" || text.toLowerCase().includes(q)
}

function pointerMoved(
  lastPointer: RefObject<{ x: number; y: number } | null>,
  event: React.MouseEvent,
): boolean {
  const last = lastPointer.current
  if (last && last.x === event.screenX && last.y === event.screenY) return false
  lastPointer.current = { x: event.screenX, y: event.screenY }
  return true
}

export type ActivationModifiers = {
  shiftKey: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

type FilterableMenuItemMeta = {
  disabled: boolean
  isSubmenu: boolean
  onActivate: (modifiers?: ActivationModifiers) => void
}
type FilterableMenuItemEntry = {
  element: HTMLElement
  metaRef: RefObject<FilterableMenuItemMeta>
}

type MenuNavApi = {
  move: (to: "up" | "down" | "home" | "end") => void
  activate: (modifiers?: ActivationModifiers) => void
}

type FilterableMenuContextValue = {
  query: string
  searchable: boolean
  activeId: string | null
  setActiveId: (id: string | null) => void
  register: (id: string, entry: FilterableMenuItemEntry) => void
  unregister: (id: string) => void
  close: () => void
  // a virtualized list registers here so the surface delegates arrow/enter to it
  registerNav: (api: MenuNavApi | null) => void
  // the menu's search input, so a closing submenu can return focus to it
  // instead of the (non-focusable) submenu trigger.
  searchRef: RefObject<HTMLInputElement | null>
  // keyboard scrolling shifts rows under a stationary cursor and the browser
  // then fires synthetic hover events; items compare coords against this to
  // only honor hover from real pointer movement.
  lastPointer: RefObject<{ x: number; y: number } | null>
}

const noop = () => {}
export const FilterableMenuContext = createContext<FilterableMenuContextValue>({
  query: "",
  searchable: false,
  activeId: null,
  setActiveId: noop,
  register: noop,
  unregister: noop,
  close: noop,
  registerNav: noop,
  searchRef: { current: null },
  lastPointer: { current: null },
})

type FilterableMenuGroupContextValue = {
  inGroup: boolean
  groupMatches: boolean
  registerLabel: (text: string) => void
}
const FilterableMenuGroupContext =
  createContext<FilterableMenuGroupContextValue>({
    inGroup: false,
    groupMatches: false,
    registerLabel: noop,
  })

type FilterableMenuSubContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}
const FilterableMenuSubContext = createContext<FilterableMenuSubContextValue>({
  open: false,
  setOpen: noop,
})

export const FilterableMenuRootContext = createContext<{ close: () => void }>({
  close: noop,
})

function useFilterableMenuItem(
  id: string,
  matches: boolean,
  meta: FilterableMenuItemMeta,
) {
  const ctx = useContext(FilterableMenuContext)
  const ref = useRef<HTMLDivElement>(null)
  const metaRef = useRef(meta)
  useEffect(() => {
    metaRef.current = meta
  })

  const { register, unregister } = ctx
  useEffect(() => {
    const element = ref.current
    if (!matches || !element) {
      return
    }
    register(id, { element, metaRef })
    return () => {
      unregister(id)
    }
  }, [id, matches, register, unregister])

  return {
    ref,
    active: ctx.activeId === id,
    setActive: () => {
      ctx.setActiveId(id)
    },
    activate: (modifiers?: ActivationModifiers) => {
      metaRef.current.onActivate(modifiers)
    },
  }
}

export function useMenuSurface({
  searchable,
  onClose,
  onExit,
}: {
  searchable: boolean
  onClose: () => void
  onExit?: () => void
}) {
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const registryRef = useRef(new Map<string, FilterableMenuItemEntry>())
  const [registryVersion, setRegistryVersion] = useState(0)
  const navRef = useRef<MenuNavApi | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const userNavigatedRef = useRef(false)
  const resetQuery = useCallback(() => {
    setQuery("")
  }, [])

  const setActiveIdUser = useCallback((id: string | null) => {
    userNavigatedRef.current = true
    setActiveId(id)
  }, [])

  const register = useCallback((id: string, entry: FilterableMenuItemEntry) => {
    registryRef.current.set(id, entry)
    setRegistryVersion((v) => v + 1)
  }, [])
  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id)
    setRegistryVersion((v) => v + 1)
  }, [])
  const registerNav = useCallback((api: MenuNavApi | null) => {
    navRef.current = api
  }, [])
  const close = useCallback(() => {
    onClose()
  }, [onClose])

  const orderedIds = useCallback(() => {
    return [...registryRef.current.entries()]
      .filter(([, entry]) => !entry.metaRef.current.disabled)
      .sort(([, a], [, b]) =>
        a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      )
      .map(([id]) => id)
  }, [])

  useEffect(() => {
    if (!searchable) {
      return
    }
    userNavigatedRef.current = false
    setActiveId(orderedIds()[0] ?? null)
  }, [query, searchable, orderedIds])

  // items registering after the query effect ran (async data) may change what
  // the first item is
  // follow it until the user picks a highlight themselves.
  useEffect(() => {
    if (!searchable) {
      return
    }
    setActiveId((prev) =>
      userNavigatedRef.current && prev !== null && registryRef.current.has(prev)
        ? prev
        : (orderedIds()[0] ?? null),
    )
  }, [registryVersion, searchable, orderedIds])

  const ctx = useMemo<FilterableMenuContextValue>(
    () => ({
      query,
      searchable,
      activeId,
      setActiveId: setActiveIdUser,
      register,
      unregister,
      close,
      registerNav,
      searchRef: inputRef,
      lastPointer: lastPointerRef,
    }),
    [
      query,
      searchable,
      activeId,
      setActiveIdUser,
      register,
      unregister,
      close,
      registerNav,
    ],
  )

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const nav = navRef.current

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      userNavigatedRef.current = true
      event.preventDefault()
      event.stopPropagation()
      if (nav) {
        nav.move(
          event.key === "Home"
            ? "home"
            : event.key === "End"
              ? "end"
              : event.key === "ArrowDown"
                ? "down"
                : "up",
        )
        return
      }
      const ids = orderedIds()
      if (ids.length === 0) {
        return
      }

      const current = activeId ? ids.indexOf(activeId) : -1
      let next: number
      if (event.key === "Home") {
        next = 0
      } else if (event.key === "End") {
        next = ids.length - 1
      } else if (event.key === "ArrowDown") {
        next = current < ids.length - 1 ? current + 1 : 0
      } else {
        next = current > 0 ? current - 1 : ids.length - 1
      }
      const nextId = ids[next] ?? null
      setActiveId(nextId)
      // keyboard should scroll, but hovering should not
      if (nextId) {
        registryRef.current
          .get(nextId)
          ?.element.scrollIntoView({ block: "nearest" })
      }
      return
    }

    const rtl =
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
      getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl"
    const inwardKey = rtl ? "ArrowLeft" : "ArrowRight"
    const outwardKey = rtl ? "ArrowRight" : "ArrowLeft"
    const input = inputRef.current
    const inInput = input !== null && event.target === input

    if (event.key === outwardKey && onExit) {
      if (
        inInput &&
        !(input.selectionStart === 0 && input.selectionEnd === 0)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      onExit()
      return
    }

    if (event.key === "Enter") {
      const modifiers: ActivationModifiers = {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      }
      if (nav) {
        event.preventDefault()
        event.stopPropagation()
        nav.activate(modifiers)
        return
      }
      if (!activeId) {
        return
      }
      const entry = registryRef.current.get(activeId)
      if (!entry) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      entry.metaRef.current.onActivate(modifiers)
      return
    }

    if (event.key === inwardKey) {
      if (nav) {
        return
      }
      if (
        inInput &&
        !(
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length
        )
      ) {
        return
      }
      if (!activeId) {
        return
      }
      const entry = registryRef.current.get(activeId)
      if (!entry) {
        return
      }
      if (!entry.metaRef.current.isSubmenu) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      entry.metaRef.current.onActivate({ shiftKey: event.shiftKey })
    }
  }

  return { ctx, query, setQuery, resetQuery, inputRef, handleKeyDown }
}

function ResetQueryOnClose({ reset }: { reset: () => void }) {
  useEffect(() => reset, [reset])
  return null
}

export function SearchBox({
  inputRef,
  query,
  setQuery,
  placeholder,
  className,
  wrapperClassName,
  autoFocus,
  before,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  setQuery: (value: string) => void
  placeholder?: string
  className?: string
  wrapperClassName?: string
  autoFocus?: boolean
  before?: ReactNode
}) {
  const c = useCommon()
  const placeholderDefault = c.plain("actions.search")

  return (
    <div className={cn("mb-1 border-b p-1", wrapperClassName)}>
      {before}
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder ?? placeholderDefault}
        autoFocus={autoFocus}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
        className={cn(searchBoxClassName, className)}
      />
    </div>
  )
}

export function FilterableMenu({
  children,
  open,
  defaultOpen,
  onOpenChange,
  handle,
}: {
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  handle?: ComponentProps<typeof Popover.Root>["handle"]
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const isControlled = open !== undefined
  const actualOpen = isControlled ? open : uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next)
      if (!isControlled) {
        setUncontrolledOpen(next)
      }
    },
    [isControlled, onOpenChange],
  )
  const close = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  const rootValue = useMemo(
    () => ({ close: handle ? noop : close }),
    [handle, close],
  )

  return (
    <FilterableMenuRootContext.Provider value={rootValue}>
      <Popover.Root
        {...(handle ? { handle } : { open: actualOpen, onOpenChange: setOpen })}
      >
        {children}
      </Popover.Root>
    </FilterableMenuRootContext.Provider>
  )
}

export function FilterableMenuTrigger(
  props: ComponentProps<typeof Popover.Trigger>,
) {
  return <Popover.Trigger data-slot="filterable-menu-trigger" {...props} />
}

export function FilterableMenuContent({
  children,
  searchable = true,
  searchPlaceholder,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  searchInputClassName,
  onClose,
  anchor,
}: {
  children: ReactNode
  searchable?: boolean
  searchPlaceholder?: string
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  className?: string
  searchInputClassName?: string
  onClose?: () => void
  anchor?: ComponentProps<typeof Popover.Positioner>["anchor"]
}) {
  const rootClose = useContext(FilterableMenuRootContext).close
  const { ctx, query, setQuery, resetQuery, inputRef, handleKeyDown } =
    useMenuSurface({
      searchable,
      onClose: onClose ?? rootClose,
    })

  return (
    <Popover.Portal>
      <Popover.Positioner
        className="isolate z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
      >
        <Popover.Popup
          data-slot="filterable-menu-content"
          initialFocus={searchable ? inputRef : undefined}
          className={cn(menuPopupClassName, "w-64", className)}
          onKeyDown={handleKeyDown}
        >
          <FilterableMenuContext.Provider value={ctx}>
            <ResetQueryOnClose reset={resetQuery} />
            {searchable && (
              <SearchBox
                inputRef={inputRef}
                query={query}
                setQuery={setQuery}
                placeholder={searchPlaceholder}
                className={searchInputClassName}
              />
            )}
            {children}
          </FilterableMenuContext.Provider>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  )
}

/** for use outside of popovers */
export function FilterableMenuSurface({
  children,
  searchable = true,
  searchPlaceholder,
  searchInputClassName,
  searchWrapperClassName,
  searchBefore,
  className,
  onClose,
}: {
  children: ReactNode | ((surface: { query: string }) => ReactNode)
  searchable?: boolean
  searchPlaceholder?: string
  searchInputClassName?: string
  searchWrapperClassName?: string
  searchBefore?: ReactNode
  className?: string
  onClose: () => void
}) {
  const { ctx, query, setQuery, inputRef, handleKeyDown } = useMenuSurface({
    searchable,
    onClose,
  })

  return (
    <div
      data-slot="filterable-menu-surface"
      className={className}
      onKeyDown={handleKeyDown}
    >
      <FilterableMenuContext.Provider value={ctx}>
        {searchable && (
          <SearchBox
            inputRef={inputRef}
            query={query}
            setQuery={setQuery}
            placeholder={searchPlaceholder}
            className={searchInputClassName}
            wrapperClassName={searchWrapperClassName}
            before={searchBefore}
            autoFocus
          />
        )}
        {typeof children === "function" ? children({ query }) : children}
      </FilterableMenuContext.Provider>
    </div>
  )
}

export function FilterableMenuGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { query } = useContext(FilterableMenuContext)
  const [labelText, setLabelText] = useState("")
  const registerLabel = useCallback((text: string) => {
    setLabelText(text)
  }, [])

  const groupMatches = query.trim() !== "" && itemMatches(query, labelText)

  const value = useMemo<FilterableMenuGroupContextValue>(
    () => ({ inGroup: true, groupMatches, registerLabel }),
    [groupMatches, registerLabel],
  )

  return (
    <FilterableMenuGroupContext.Provider value={value}>
      <div role="group" className={className}>
        {children}
      </div>
    </FilterableMenuGroupContext.Provider>
  )
}

export function FilterableMenuLabel({
  children,
  className,
  action,
}: {
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  const { query } = useContext(FilterableMenuContext)
  const group = useContext(FilterableMenuGroupContext)
  const text = typeof children === "string" ? children : ""

  const { inGroup, registerLabel } = group
  useEffect(() => {
    if (inGroup) registerLabel(text)
  }, [inGroup, registerLabel, text])

  if (!inGroup) return null
  if (query.trim() !== "" && !group.groupMatches) return null

  if (!action) {
    return <div className={cn(menuLabelClassName, className)}>{children}</div>
  }

  return (
    <div
      className={cn(
        menuLabelClassName,
        "flex items-center justify-between gap-2 py-0.5 pr-1",
        className,
      )}
    >
      <span>{children}</span>
      {action}
    </div>
  )
}

export function FilterableMenuSeparator({ className }: { className?: string }) {
  const { query } = useContext(FilterableMenuContext)
  if (query.trim()) return null
  return (
    <div
      role="separator"
      className={cn("bg-border/50 -mx-1 my-1 h-px", className)}
    />
  )
}

export type FilterableMenuItemProps = {
  children: ReactNode
  icon?: ReactNode
  onSelect?: (modifiers?: ActivationModifiers) => void
  /** extra text to match when filtering */
  keywords?: string
  /** the searchable text when `children` aren't a plain string */
  textValue?: string
  variant?: "default" | "destructive"
  disabled?: boolean
  closeOnClick?: boolean
  className?: string
  /** native hover hint, e.g. why a row is disabled */
  title?: string
  /** pass false when the rows are already filtered upstream (e.g. server
   * search results) so the query doesn't hide them again client-side.
   */
  filter?: boolean
}

export function FilterableMenuItem({
  children,
  icon,
  onSelect,
  variant,
  disabled,
  closeOnClick,
  className,
  title,
  textValue,
  keywords,
  filter = true,
}: FilterableMenuItemProps) {
  const { query, close, lastPointer } = useContext(FilterableMenuContext)
  const group = useContext(FilterableMenuGroupContext)
  const id = useId()

  const text = `${
    textValue ?? (typeof children === "string" ? children : "")
  } ${keywords ?? ""}`
  const matches = !filter || group.groupMatches || itemMatches(query, text)

  const { ref, active, setActive, activate } = useFilterableMenuItem(
    id,
    matches,
    {
      disabled: !!disabled,
      isSubmenu: false,
      onActivate: (modifiers) => {
        onSelect?.(modifiers)
        if (closeOnClick !== false) {
          close()
        }
      },
    },
  )

  if (!matches) {
    return null
  }

  return (
    <div
      ref={ref}
      role="menuitem"
      data-highlighted={active || undefined}
      data-disabled={disabled || undefined}
      data-variant={variant}
      title={title}
      className={cn(menuItemClassName, className)}
      onMouseMove={(event) => {
        if (!disabled && pointerMoved(lastPointer, event)) setActive()
      }}
      onClick={(event) => {
        if (!disabled)
          activate({
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
          })
      }}
    >
      {icon}
      {children}
    </div>
  )
}

export function FilterableMenuSub({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo<FilterableMenuSubContextValue>(
    () => ({ open, setOpen }),
    [open],
  )
  return (
    <FilterableMenuSubContext.Provider value={value}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        {children}
      </Popover.Root>
    </FilterableMenuSubContext.Provider>
  )
}

export function FilterableMenuSubTrigger({
  children,
  icon,
  disabled,
  className,
  title,
  textValue,
  keywords,
}: {
  children: ReactNode
  icon?: ReactNode
  disabled?: boolean
  className?: string
  title?: string
  textValue?: string
  keywords?: string
}) {
  const id = useId()
  const { query, lastPointer } = useContext(FilterableMenuContext)
  const group = useContext(FilterableMenuGroupContext)
  const { open, setOpen } = useContext(FilterableMenuSubContext)

  const text = `${
    textValue ?? (typeof children === "string" ? children : "")
  } ${keywords ?? ""}`
  const matches = group.groupMatches || itemMatches(query, text)

  const { ref, active, setActive } = useFilterableMenuItem(id, matches, {
    disabled: !!disabled,
    isSubmenu: true,
    onActivate: () => {
      setOpen(true)
    },
  })

  if (!matches) {
    return null
  }

  return (
    <Popover.Trigger
      openOnHover
      delay={0}
      closeDelay={0}
      disabled={disabled}
      nativeButton={false}
      render={
        <div
          ref={ref}
          role="menuitem"
          aria-haspopup="menu"
          data-highlighted={active || undefined}
          data-disabled={disabled || undefined}
          data-open={open || undefined}
          title={title}
          className={cn(menuSubTriggerClassName, className)}
          onMouseMove={(event) => {
            if (!disabled && pointerMoved(lastPointer, event)) {
              setActive()
            }
          }}
        >
          {icon}
          {children}
          <ChevronRight className="ml-auto" />
        </div>
      }
    />
  )
}

export function FilterableMenuSubContent({
  children,
  searchable = true,
  searchPlaceholder,
  className,
  side = "right",
  align = "start",
  sideOffset = -4,
  alignOffset = -4,
}: {
  children: ReactNode | ((ctx: { close: () => void }) => ReactNode)
  searchable?: boolean
  searchPlaceholder?: string
  className?: string
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
  alignOffset?: number
}) {
  const { open, setOpen } = useContext(FilterableMenuSubContext)
  const parentSearchRef = useContext(FilterableMenuContext).searchRef
  const close = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  const { ctx, query, setQuery, resetQuery, inputRef, handleKeyDown } =
    useMenuSurface({
      searchable,
      onClose: close,
      onExit: close,
    })

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open, inputRef])

  return (
    <Popover.Portal>
      <Popover.Positioner
        className="isolate z-50 outline-none"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <Popover.Popup
          data-slot="filterable-menu-sub-content"
          finalFocus={parentSearchRef}
          initialFocus={searchable ? inputRef : undefined}
          className={cn(menuPopupClassName, "w-64", className)}
          onKeyDown={handleKeyDown}
        >
          {open && (
            <FilterableMenuContext.Provider value={ctx}>
              <ResetQueryOnClose reset={resetQuery} />
              {searchable && (
                <SearchBox
                  inputRef={inputRef}
                  query={query}
                  setQuery={setQuery}
                  placeholder={searchPlaceholder}
                />
              )}
              {typeof children === "function" ? children({ close }) : children}
            </FilterableMenuContext.Provider>
          )}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  )
}

export function VirtualizedFilterableMenuItems<T>({
  items,
  getKey,
  getText,
  renderRow,
  onSelect,
  closeOnSelect = false,
  create,
  footer,
  loading = false,
  emptyText,
  estimateSize = ROW_HEIGHT,
}: {
  items: T[]
  getKey: (item: T) => string
  getText: (item: T) => string
  renderRow: (item: T) => ReactNode
  onSelect: (item: T, modifiers: ActivationModifiers) => void
  closeOnSelect?: boolean
  create?: {
    label: (query: string) => string
    onCreate: (query: string) => void
    allowEmptyQuery?: boolean
  }
  footer?: ReactNode
  loading?: boolean
  emptyText?: string
  estimateSize?: number
}) {
  const c = useCommon()
  const { query, close, registerNav, lastPointer } = useContext(
    FilterableMenuContext,
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const getTextRef = useRef(getText)
  getTextRef.current = getText

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q === ""
        ? items
        : items.filter((i) => getTextRef.current(i).toLowerCase().includes(q)),
    [items, q],
  )

  const trimmed = query.trim()
  const showCreate =
    !!create &&
    (trimmed.length > 0 || !!create.allowEmptyQuery) &&
    !items.some((i) => getTextRef.current(i).toLowerCase() === q)
  const createIndex = showCreate ? filtered.length : -1
  const rowCount = filtered.length + (showCreate ? 1 : 0)

  useEffect(() => {
    setActive(0)
  }, [q])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 12,
  })

  const activateRef = useRef<(modifiers: ActivationModifiers) => void>(() => {})
  activateRef.current = (modifiers) => {
    if (active === createIndex) {
      create?.onCreate(trimmed)
    } else {
      const item = filtered[active]
      if (!item) {
        return
      }
      onSelect(item, modifiers)
    }
    if (closeOnSelect) close()
  }

  const moveRef = useRef<(to: "up" | "down" | "home" | "end") => void>(() => {})
  moveRef.current = (to) => {
    if (rowCount === 0) return
    setActive((prev) => {
      if (to === "home") {
        return 0
      }
      if (to === "end") {
        return rowCount - 1
      }
      if (to === "down") {
        return prev < rowCount - 1 ? prev + 1 : 0
      }
      return prev > 0 ? prev - 1 : rowCount - 1
    })
  }

  useEffect(() => {
    registerNav({
      move: (to) => {
        moveRef.current(to)
      },
      activate: (modifiers) => {
        activateRef.current(modifiers ?? { shiftKey: false })
      },
    })
    return () => {
      registerNav(null)
    }
  }, [registerNav])

  useEffect(() => {
    if (active < filtered.length) {
      virtualizer.scrollToIndex(active, { align: "auto" })
    }
  }, [active, filtered.length, virtualizer])

  if (loading) {
    return <LoadingRows />
  }

  if (rowCount === 0) {
    return (
      <div className="text-muted-foreground px-2 py-3 text-center text-xs">
        {emptyText ?? c("empty.noResults")}
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} className={listClassName}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const item = filtered[row.index]
            if (!item) {
              return null
            }
            return (
              <div
                key={getKey(item)}
                role="menuitem"
                data-highlighted={row.index === active || undefined}
                className={menuItemClassName}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: estimateSize,
                  transform: `translateY(${row.start}px)`,
                }}
                onMouseMove={(event) => {
                  if (pointerMoved(lastPointer, event)) setActive(row.index)
                }}
                onClick={(event) => {
                  onSelect(item, {
                    shiftKey: event.shiftKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                  })
                  if (closeOnSelect) close()
                }}
              >
                {renderRow(item)}
              </div>
            )
          })}
        </div>
      </div>

      {create && showCreate && (
        <button
          type="button"
          data-highlighted={active === createIndex || undefined}
          className={cn(
            menuItemClassName,
            "text-primary data-highlighted:bg-accent w-full",
          )}
          onMouseMove={(event) => {
            if (pointerMoved(lastPointer, event)) setActive(createIndex)
          }}
          onClick={() => {
            create.onCreate(trimmed)
            if (closeOnSelect) {
              close()
            }
          }}
        >
          <icon.Add />
          {create.label(trimmed)}
        </button>
      )}

      {footer}
    </>
  )
}
