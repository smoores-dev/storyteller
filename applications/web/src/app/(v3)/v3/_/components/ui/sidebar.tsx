"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { type VariantProps, cva } from "class-variance-authority"
import * as React from "react"

import { Button } from "@v3/_/components/ui/button"
import { Input } from "@v3/_/components/ui/input"
import { Separator } from "@v3/_/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@v3/_/components/ui/sheet"
import { Skeleton } from "@v3/_/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { TooltipButton } from "./tooltip-button"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "2.3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  pinned: boolean
  setPinned: (pinned: boolean) => void
  hoverExpanded: boolean
  setHoverExpanded: (expanded: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function useSidebarMaybe() {
  const context = React.useContext(SidebarContext)
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [pinned, setPinned] = React.useState(defaultOpen)
  const [hoverExpanded, setHoverExpanded] = React.useState(false)

  // sidebar is open if pinned OR hovered
  const open = openProp ?? (pinned || hoverExpanded)

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(pinned) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        setPinned(openState)
      }
    },
    [setOpenProp, pinned],
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return

    document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }, [open])

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((open) => !open)
      return
    }
    setPinned((p) => !p)
  }, [isMobile])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      pinned,
      setPinned,
      hoverExpanded,
      setHoverExpanded,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      pinned,
      hoverExpanded,
    ],
  )
  //

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex h-screen w-full",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const {
    isMobile,
    state,
    openMobile,
    setOpenMobile,
    pinned,
    setHoverExpanded,
  } = useSidebar()
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const handleMouseEnter = React.useCallback(() => {
    if (pinned) return
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverExpanded(true)
    }, 50)
  }, [pinned, setHoverExpanded])

  const handleMouseLeave = React.useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverExpanded(false)
    }, 150)
  }, [setHoverExpanded])

  // pin/unpin should snap instantly; hover transitions should stay smooth.
  // briefly suppress transitions when pinned changes, then re-enable so the
  // next hover expand/collapse animates normally.
  const [skipTransition, setSkipTransition] = React.useState(false)
  const prevPinnedRef = React.useRef(pinned)

  React.useEffect(() => {
    if (prevPinnedRef.current !== pinned) {
      setSkipTransition(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSkipTransition(false)
        })
      })
    }

    prevPinnedRef.current = pinned
  }, [pinned])

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground h-dvh max-h-dvh w-(--sidebar-width) overflow-hidden p-0 [&>button]:hidden"
          side={side}
          {...props}
          style={
            {
              ...props.style,
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // when collapsed but hovering, we show expanded width but keep the gap small
  const isHoverExpanded = state === "expanded" && !pinned

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      data-pinned={pinned}
      data-hover-expanded={isHoverExpanded}
    >
      {/* gap stays at icon width when not pinned -- no transition because
          the gap only changes on pin/unpin, which should be instant */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative bg-transparent",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          pinned
            ? "w-(--sidebar-width)"
            : variant === "floating" || variant === "inset"
              ? "w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
              : "w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh md:flex",
          !skipTransition &&
            "transition-[left,right,width] duration-150 ease-out",
          state === "expanded" ? "w-(--sidebar-width)" : "",
          state === "collapsed"
            ? variant === "floating" || variant === "inset"
              ? "w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
              : "w-(--sidebar-width-icon)"
            : "",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          className,
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            "bg-sidebar border-r-px border-sidebar-border flex size-full flex-col transition-shadow duration-200",
            variant === "floating" && "ring-sidebar-border rounded-lg ring-1",
            // isHoverExpanded && "shadow-lg",
            "shadow-xl",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <icon.LayoutSidebar />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarPinButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pinned, setPinned, isMobile } = useSidebar()

  if (isMobile) return null

  return (
    <TooltipButton
      data-sidebar="pin"
      data-slot="sidebar-pin"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "text-sidebar-primary opacity-0 transition-opacity group-hover/sidebar-wrapper:opacity-100",
        pinned && "opacity-100",
        className,
      )}
      onClick={() => {
        setPinned(!pinned)
      }}
      {...props}
      tooltip={pinned ? "Unpin sidebar" : "Pin sidebar open"}
      aria-label={pinned ? "Unpin Sidebar" : "Pin Sidebar"}
      shortcut={["Mod+B"]}
    >
      {pinned ? (
        <icon.PinFilled className="size-4" />
      ) : (
        <icon.Pin className="size-4" />
      )}
      <span className="sr-only">
        {pinned ? "Unpin Sidebar" : "Pin Sidebar"}
      </span>
    </TooltipButton>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className,
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background @container/main relative flex min-h-0 w-full flex-1 flex-col overflow-hidden md:peer-data-[variant=inset]:m-0",
        className,
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn(
        "bg-sidebar-accent/40 border-sidebar-border h-8 w-full",
        className,
      )}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-x-visible overflow-y-auto overscroll-contain group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn(
        "relative flex w-full min-w-0 flex-col px-1 py-1",
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "text-sidebar-foreground/70 ring-sidebar-ring h-8 rounded-md px-2 text-xs transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-0 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 flex shrink-0 items-center outline-hidden [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    ...(render ? { render } : {}),
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  })
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 w-5 rounded-md p-0 focus-visible:ring-2 [&>svg]:size-4 flex aspect-square items-center justify-center outline-hidden transition-transform [&>svg]:shrink-0 after:absolute after:-inset-2 md:after:hidden group-data-[collapsible=icon]:hidden",
          className,
        ),
      },
      props,
    ),
    ...(render ? { render } : {}),
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  })
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-xs", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-px", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative px-2", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "ring-sidebar-ring font-sans   hover:text-sidebar-accent-foreground rounded-none rounded-md  hover:bg-sidebar-accent/50 active:text-sidebar-accent-foreground data-active:font-medium data-active:[&_svg:first-child]:stroke-2 data-active:text-sidebar-accent-foreground hover:bg-transparent overflow-x-visible! data-open:hover:bg-sidebar-accent/50 data-open:hover:text-sidebar-accent-foreground gap-2 p-2 text-left text-xs transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-has-data-[sidebar=menu-badge]/menu-item:pr-8 focus-visible:ring-2 peer/menu-button flex w-full items-center overflow-hidden outline-hidden group/menu-button disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0   scrollbar-none",
  {
    variants: {
      variant: {
        default: "hover:text-sidebar-accent-foreground",
        outline:
          "bg-sidebar hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground ring-sidebar-border ring-1 hover:ring-sidebar-accent",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-sm",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  // the menu vocabulary is reused by panel sidebars (settings, library) that
  // aren't the collapsible shell. only the collapsed-state tooltip needs the
  // context, so fall back instead of throwing when there's no provider
  const ctx = useSidebarMaybe()
  const isMobile = ctx?.isMobile ?? false
  const state = ctx?.state ?? "expanded"
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
        style: { scrollbarWidth: "none" },
      },
      props,
    ),
    ...(!render
      ? {}
      : !tooltip
        ? { render }
        : { render: TooltipTrigger as useRender.RenderProp }),
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  })

  if (!tooltip) {
    return comp
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-3 aspect-square w-5 rounded-[calc(var(--radius-sm)-2px)] p-0 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 focus-visible:ring-2 [&>svg]:size-4 flex items-center justify-center outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0",
          showOnHover &&
            "peer-data-active/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-open:opacity-100 data-popup-open:opacity-100 md:opacity-0",
          className,
        ),
      },
      props,
    ),
    ...(render ? { render } : {}),
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground/70 peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground pointer-events-none absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] px-1 text-[11px] tabular-nums transition-opacity select-none group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1",
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  })

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground h-7 gap-2 rounded-md px-2 focus-visible:ring-2 data-[size=md]:text-xs data-[size=sm]:text-xs [&>svg]:size-4 flex min-w-0 -translate-x-px items-center overflow-hidden outline-hidden group-data-[collapsible=icon]:hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    ...(render ? { render } : {}),
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  })
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarPinButton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
  useSidebarMaybe,
}
