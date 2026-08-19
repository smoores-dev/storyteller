import { type VariantProps, cva } from "class-variance-authority"
import { type ComponentType, type SVGProps } from "react"

import { cn } from "@/cn"

export const iconVariants = cva("size-4 shrink-0", {
  variants: {
    size: {
      default: "size-4",
      sm: "size-3.5",
      xs: "size-3",
      lg: "size-5",
    },
    weight: {
      default: "",
      thin: "stroke-[1.5]",
      bold: "stroke-[2.5]",
    },
  },
  defaultVariants: {
    size: "default",
    weight: "default",
  },
})

export type IconVariants = VariantProps<typeof iconVariants>

export type StyledIconProps = Omit<SVGProps<SVGSVGElement>, "size" | "stroke"> &
  IconVariants

export type StyledIcon = ComponentType<StyledIconProps>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function styled(Icon: ComponentType<any>): StyledIcon {
  function StyledIcon({ className, size, weight, ...props }: StyledIconProps) {
    return (
      <Icon
        // icon should not be shown to screen readers
        // a11y tools will be mad
        aria-hidden="true"
        {...props}
        className={cn(iconVariants({ size, weight }), className)}
      />
    )
  }

  StyledIcon.displayName = Icon.displayName ?? Icon.name

  return StyledIcon
}
