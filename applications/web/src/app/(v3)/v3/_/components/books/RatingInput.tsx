import { useCallback, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@v3/_/components/ui/popover"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

type RatingInputProps = {
  value: number | null
  onChange: (rating: number | null) => void
  readOnly?: boolean
  size?: "sm" | "md" | "lg"
  color?: string
  iconOverride?: React.ReactNode
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
}

export function RatingInput({
  value,
  onChange,
  readOnly = false,
  size = "md",
  color,
  iconOverride,
}: RatingInputProps) {
  const isMobile = useIsMobile()
  const { ratingIcon } = useUserPreferences()
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const ratingStyle = iconOverride ?? ratingIcon

  const Icon = ratingStyle === "heart" ? icon.Heart : icon.Star
  const displayValue = hoverValue ?? value ?? 0

  const fillStyle = color ? { color, fill: color } : undefined
  const defaultFillClass = color ? "" : "fill-yellow-400 text-yellow-400"

  const handleClick = useCallback(
    (rating: number) => {
      if (value === rating) {
        onChange(null)
      } else {
        onChange(rating)
      }
    },
    [value, onChange],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
      if (readOnly) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const half = x < rect.width / 2
      setHoverValue(starIndex + (half ? 0.5 : 1))
    },
    [readOnly],
  )

  const renderStars = (interactive: boolean) => (
    <div
      className={cn(
        "flex h-8 items-center gap-0.5",
        !readOnly && "cursor-pointer",
      )}
      onMouseLeave={() => {
        if (interactive) setHoverValue(null)
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1
        const filled = displayValue >= starValue
        const residual = displayValue - i
        const percentFilled = !filled && residual > 0 && residual * 100

        return (
          <div
            key={i}
            className="relative"
            onMouseMove={(e) => {
              if (interactive) handleMouseMove(e, i)
            }}
            onClick={() => {
              if (interactive) handleClick(hoverValue ?? starValue)
            }}
          >
            {/* background icon (empty) */}
            <Icon
              className={cn(
                sizeClasses[size],
                "text-tinted/30 transition-colors",
              )}
            />
            {/* filled icon (full or somewhat filled) */}
            {(filled || percentFilled) && (
              <Icon
                className={cn(
                  sizeClasses[size],
                  "absolute inset-0 transition-colors",
                  defaultFillClass,
                )}
                style={
                  percentFilled
                    ? {
                        ...fillStyle,
                        clipPath: `inset(0 ${Math.max(10, Math.min(100 - percentFilled, 90))}% 0 0)`,
                      }
                    : fillStyle
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )

  if (readOnly) {
    return renderStars(false)
  }

  if (isMobile) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <button type="button" className="touch-manipulation">
              {renderStars(false)}
            </button>
          }
        />
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Tap to rate
            </span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => {
                const active = (value ?? 0) >= rating
                return (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => {
                      handleClick(rating)
                      setIsOpen(false)
                    }}
                    className={cn(
                      "hover:bg-accent active:bg-accent flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-6 w-6",
                        active ? defaultFillClass : "text-muted-foreground",
                      )}
                      style={active ? fillStyle : undefined}
                    />
                  </button>
                )
              })}
            </div>
            {value !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(null)
                  setIsOpen(false)
                }}
                className="mt-1"
              >
                Clear rating
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return renderStars(true)
}

type RatingDisplayProps = {
  rating: number | null
  size?: "sm" | "md" | "lg"
  color?: string
}

export function RatingDisplay({
  rating,
  size = "md",
  color,
}: RatingDisplayProps) {
  return (
    <RatingInput
      value={rating}
      onChange={() => {}}
      readOnly
      size={size}
      color={color}
    />
  )
}
