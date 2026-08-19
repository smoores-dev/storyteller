"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import * as icon from "@/icons"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      icons={{
        success: <icon.CircleCheck className="size-4" />,
        info: <icon.InfoCircle className="size-4" />,
        warning: <icon.AlertTriangle className="size-4" />,
        error: <icon.AlertOctagon className="size-4" />,
        loading: <icon.LoaderIOSish className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
