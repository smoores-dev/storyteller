"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import * as React from "react"
import { Drawer } from "vaul-base"

import { Button } from "@v3/_/components/ui/button"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { useSidebarMaybe } from "./sidebar"

function Dialog({
  ...props
}: Omit<DialogPrimitive.Root.Props, "children"> & {
  children?: React.ReactNode
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <Drawer.Root data-slot="dialog" {...(props as any)} />
  }
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <Drawer.Trigger data-slot="dialog-trigger" {...props} />
  }
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <Drawer.Portal data-slot="dialog-portal" {...props} />
  }
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <Drawer.Close data-slot="dialog-close" {...props} />
  }
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Drawer.Overlay
        className="fixed inset-0 z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs"
        {...props}
      />
    )
  }

  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  forceRender = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  forceRender?: React.ComponentProps<typeof DialogOverlay>["forceRender"]
}) {
  const { state } = useSidebarMaybe() ?? {}

  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Drawer.Portal>
        <DialogOverlay forceRender={forceRender} />
        <Drawer.Content
          className={cn(
            "bg-background fixed right-0 bottom-0 left-0 z-50 grid h-[85svh] gap-4 overflow-hidden rounded-t-2xl p-4",
            className,
          )}
          {...props}
        >
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay forceRender={forceRender} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "bg-background ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg p-4 text-xs/relaxed ring-1 duration-100 outline-none sm:max-w-sm",
          state === "expanded"
            ? `left-1/2 md:left-[calc(50%_+_8rem)]`
            : "left-1/2 md:left-[calc(50%_+_1rem)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <icon.Close />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Drawer.Title
        className={cn("font-heading text-base font-medium", className)}
        {...props}
      />
    )
  }
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Drawer.Description
        className={cn(
          "text-muted-foreground *:[a]:hover:text-foreground text-xs/relaxed *:[a]:underline *:[a]:underline-offset-3",
          className,
        )}
        {...props}
      />
    )
  }
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-xs/relaxed *:[a]:underline *:[a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
